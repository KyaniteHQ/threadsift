import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { PIN_KINDS, PROPOSAL_KINDS, type PinKind, type ProposalKind } from "../src/core/kinds.ts";
import { LIFECYCLE } from "../src/core/proposal-lifecycle.ts";
import { Instance } from "./instance.ts";
import { paste } from "./related-fixtures.ts";

const BUSY_TIMEOUT_MS = 5000;

type Subjects = Readonly<{ columns: readonly string[]; create: () => readonly number[] }>;

describe("every proposal and Pin value in src/core/kinds.ts passes the consistency triggers", () => {
  let instance: Instance;
  let database: DatabaseSync;
  let saved = 0;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    await paste(instance, "subject", { title: "A subject" });
    database = new DatabaseSync(instance.databaseFile, { timeout: BUSY_TIMEOUT_MS });
  });

  after(async () => {
    database.close();
    await instance.close();
  });

  const INSERTS = {
    tags: "insert into tags (key, name) values (?, ?), (?, ?) returning id",
    topics: "insert into topics (key, name) values (?, ?), (?, ?) returning id",
    items:
      "insert into items (source, kind, normalized_url, original_url, saved_at) values ('article', 'article', ?, ?, 0), ('article', 'article', ?, ?, 0) returning id",
  } as const;

  const insertSubjects = (table: keyof typeof INSERTS): readonly [number, number] => {
    saved += 1;

    const rows = database
      .prepare(INSERTS[table])
      .all(`a${String(saved)}`, "A", `b${String(saved)}`, "B");

    const [from, into] = z
      .array(z.object({ id: z.number() }))
      .parse(rows)
      .map(({ id }) => id);

    return [from ?? 0, into ?? 0];
  };

  const insertTags = (): readonly [number, number] => insertSubjects("tags");

  const insertHighlight = (): readonly [number] => {
    saved += 1;

    const rows = database
      .prepare(
        `insert into highlights (item_id, exact, prefix, suffix, hint, projection, created_at, status, start)
         select id, ?, '', '', 0, 1, 0, 'gone', null from items limit 1 returning id`,
      )
      .all(`quote ${String(saved)}`);

    return [z.array(z.object({ id: z.number() })).parse(rows)[0]?.id ?? 0];
  };

  const PROPOSAL_SUBJECTS = {
    "tag-merge": {
      columns: ["from_tag_id", "into_tag_id"],
      create: () => insertSubjects("tags"),
    },
    "topic-merge": {
      columns: ["from_topic_id", "into_topic_id"],
      create: () => insertSubjects("topics"),
    },
    "highlight-lost": { columns: ["highlight_id"], create: insertHighlight },
    "overview-gap": { columns: ["topic_id"], create: () => [insertSubjects("topics")[0]] },
    "items-disagree": {
      columns: ["from_item_id", "into_item_id", "from_digest", "into_digest"],
      create: () => [...insertSubjects("items"), 1, 2],
    },
  } as const satisfies Readonly<Record<ProposalKind, Subjects>>;

  const proposalInsert = (kind: ProposalKind) => {
    const { columns } = PROPOSAL_SUBJECTS[kind];
    const marks = columns.map(() => "?").join(", ");

    return database.prepare(
      `insert into proposals (kind, ${columns.join(", ")}, reason, state, created_at) values (?, ${marks}, 'a reason', ?, 0)`,
    );
  };

  const proposalCases = (kind: ProposalKind, state: string): void => {
    it(`stores a ${kind} proposal, ${state}`, () => {
      const subjects = PROPOSAL_SUBJECTS[kind].create();

      assert.doesNotThrow(() => {
        proposalInsert(kind).run(kind, ...subjects, state);
      });
    });

    it(`updates a ${kind} proposal to ${state}`, () => {
      const subjects = PROPOSAL_SUBJECTS[kind].create();
      proposalInsert(kind).run(kind, ...subjects, "open");

      assert.doesNotThrow(() => {
        database
          .prepare(
            `update proposals set kind = ?, state = ? where ${PROPOSAL_SUBJECTS[kind].columns[0]} = ?`,
          )
          .run(kind, state, subjects[0]);
      });
    });
  };

  for (const kind of PROPOSAL_KINDS) {
    for (const state of LIFECYCLE[kind].held) proposalCases(kind, state);
  }

  it("refuses a proposal with a kind or state the code does not list, on insert and on update", () => {
    const [from, into] = insertTags();
    const insert = proposalInsert("tag-merge");

    assert.throws(() => insert.run("unknown", from, into, "open"), /proposals_values/u);
    assert.throws(() => insert.run("tag-merge", from, into, "unknown"), /proposals_values/u);

    insert.run("tag-merge", from, into, "open");

    const update = database.prepare(
      "update proposals set kind = ?, state = ? where from_tag_id = ?",
    );

    assert.throws(() => update.run("unknown", "open", from), /proposals_values/u);
    assert.throws(() => update.run("tag-merge", "unknown", from), /proposals_values/u);
  });

  it("refuses a proposal whose subject columns do not match its kind, on insert and on update", () => {
    const [fromTag, intoTag] = insertTags();
    const [fromTopic, intoTopic] = insertSubjects("topics");

    assert.throws(
      () => proposalInsert("tag-merge").run("topic-merge", fromTag, intoTag, "open"),
      /proposals_subject/u,
    );
    assert.throws(
      () => proposalInsert("topic-merge").run("tag-merge", fromTopic, intoTopic, "open"),
      /proposals_subject/u,
    );

    proposalInsert("tag-merge").run("tag-merge", fromTag, intoTag, "open");
    proposalInsert("topic-merge").run("topic-merge", fromTopic, intoTopic, "open");

    assert.throws(
      () =>
        database
          .prepare("update proposals set kind = 'topic-merge' where from_tag_id = ?")
          .run(fromTag),
      /proposals_subject/u,
    );
    assert.throws(
      () =>
        database
          .prepare("update proposals set from_tag_id = ? where from_topic_id = ?")
          .run(fromTag, fromTopic),
      /proposals_subject/u,
    );
  });

  const PIN_SUBJECTS = {
    "tag-merge": { columns: ["into_tag_id"], create: () => [insertSubjects("tags")[1]] },
    "topic-merge": { columns: ["into_topic_id"], create: () => [insertSubjects("topics")[1]] },
    "items-disagree": {
      columns: ["from_item_id", "into_item_id", "from_digest", "into_digest"],
      create: () => [...insertSubjects("items"), 1, 2],
    },
  } as const satisfies Readonly<Record<PinKind, Subjects>>;

  const pinInsert = (kind: PinKind) => {
    const { columns } = PIN_SUBJECTS[kind];
    const marks = columns.map(() => "?").join(", ");

    return database.prepare(
      `insert into pins (kind, from_key, from_name, ${columns.join(", ")}, created_at) values (?, ?, 'a name', ${marks}, 0)`,
    );
  };

  const pinCases = (kind: PinKind): void => {
    it(`stores and updates a ${kind} Pin`, () => {
      const subjects = PIN_SUBJECTS[kind].create();

      assert.doesNotThrow(() => {
        pinInsert(kind).run(kind, `a key for ${kind}`, ...subjects);
        database
          .prepare("update pins set kind = ? where from_key = ?")
          .run(kind, `a key for ${kind}`);
      });
    });
  };

  for (const kind of PIN_KINDS) pinCases(kind);

  it("refuses a Pin with a kind the code does not list, on insert and on update", () => {
    const [, into] = insertTags();

    const insert = database.prepare(
      "insert into pins (kind, from_key, from_name, into_tag_id, created_at) values (?, 'refused key', 'a name', ?, 0)",
    );

    assert.throws(() => insert.run("unknown", into), /pins_values/u);

    insert.run("tag-merge", into);

    assert.throws(() => {
      database.prepare("update pins set kind = 'unknown' where from_key = 'refused key'").run();
    }, /pins_values/u);
  });

  it("refuses a Pin whose target column does not match its kind, on insert and on update", () => {
    const [, intoTag] = insertTags();
    const [, intoTopic] = insertSubjects("topics");

    assert.throws(
      () =>
        database
          .prepare(
            "insert into pins (kind, from_key, from_name, into_topic_id, created_at) values ('tag-merge', 'wrong column', 'a name', ?, 0)",
          )
          .run(intoTopic),
      /pins_subject/u,
    );
    assert.throws(
      () =>
        database
          .prepare(
            "insert into pins (kind, from_key, from_name, into_tag_id, created_at) values ('topic-merge', 'wrong column', 'a name', ?, 0)",
          )
          .run(intoTag),
      /pins_subject/u,
    );
    assert.throws(
      () =>
        database
          .prepare(
            "insert into pins (kind, from_key, from_name, into_tag_id, into_topic_id, created_at) values ('topic-merge', 'both columns', 'a name', ?, ?, 0)",
          )
          .run(intoTag, intoTopic),
      /pins_subject/u,
    );
    assert.throws(
      () =>
        database
          .prepare(
            "insert into pins (kind, from_key, from_name, created_at) values ('tag-merge', 'no target', 'a name', 0)",
          )
          .run(),
      /pins_subject/u,
    );

    pinInsert("tag-merge").run("tag-merge", "tag for update", intoTag);
    pinInsert("topic-merge").run("topic-merge", "topic for update", intoTopic);

    assert.throws(
      () =>
        database
          .prepare("update pins set kind = 'topic-merge' where from_key = 'tag for update'")
          .run(),
      /pins_subject/u,
    );
    assert.throws(
      () =>
        database
          .prepare("update pins set into_tag_id = ? where from_key = 'topic for update'")
          .run(intoTag),
      /pins_subject/u,
    );
  });

  it("lets a Tag Pin and a Topic Pin share a key", () => {
    const [, intoTag] = insertTags();
    const [, intoTopic] = insertSubjects("topics");

    pinInsert("tag-merge").run("tag-merge", "shared key", intoTag);

    assert.doesNotThrow(() => {
      pinInsert("topic-merge").run("topic-merge", "shared key", intoTopic);
    });
    assert.throws(() => {
      pinInsert("topic-merge").run("topic-merge", "shared key", intoTopic);
    }, /UNIQUE/u);
  });
});
