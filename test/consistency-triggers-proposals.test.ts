import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { MERGE_KINDS, PIN_KINDS, PROPOSAL_STATES } from "../src/core/kinds.ts";
import { Instance } from "./instance.ts";

const BUSY_TIMEOUT_MS = 5000;

describe("every proposal and Pin value in src/core/kinds.ts passes the consistency triggers", () => {
  let instance: Instance;
  let database: DatabaseSync;
  let saved = 0;

  before(async () => {
    instance = await Instance.start();
    database = new DatabaseSync(instance.databaseFile, { timeout: BUSY_TIMEOUT_MS });
  });

  after(async () => {
    database.close();
    await instance.close();
  });

  const SUBJECTS = {
    "tag-merge": { table: "tags", from: "from_tag_id", into: "into_tag_id" },
    "topic-merge": { table: "topics", from: "from_topic_id", into: "into_topic_id" },
  } as const;

  const insertSubjects = (table: "tags" | "topics"): readonly [number, number] => {
    saved += 1;

    const rows = database
      .prepare(`insert into ${table} (key, name) values (?, ?), (?, ?) returning id`)
      .all(`a${String(saved)}`, "A", `b${String(saved)}`, "B");

    const [from, into] = z
      .array(z.object({ id: z.number() }))
      .parse(rows)
      .map(({ id }) => id);

    return [from ?? 0, into ?? 0];
  };

  const insertTags = (): readonly [number, number] => insertSubjects("tags");

  const proposalInsert = (kind: keyof typeof SUBJECTS) =>
    database.prepare(
      `insert into proposals (kind, ${SUBJECTS[kind].from}, ${SUBJECTS[kind].into}, reason, state, created_at) values (?, ?, ?, 'a reason', ?, 0)`,
    );

  const proposalCases = (kind: keyof typeof SUBJECTS, state: string): void => {
    it(`stores a ${kind} proposal, ${state}`, () => {
      const [from, into] = insertSubjects(SUBJECTS[kind].table);

      assert.doesNotThrow(() => {
        proposalInsert(kind).run(kind, from, into, state);
      });
    });

    it(`updates a ${kind} proposal to ${state}`, () => {
      const [from, into] = insertSubjects(SUBJECTS[kind].table);
      proposalInsert(kind).run(kind, from, into, "open");

      assert.doesNotThrow(() => {
        database
          .prepare(`update proposals set kind = ?, state = ? where ${SUBJECTS[kind].from} = ?`)
          .run(kind, state, from);
      });
    });
  };

  for (const kind of MERGE_KINDS) {
    for (const state of PROPOSAL_STATES) proposalCases(kind, state);
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

  const pinInsert = (kind: keyof typeof SUBJECTS) =>
    database.prepare(
      `insert into pins (kind, from_key, from_name, ${SUBJECTS[kind].into}, created_at) values (?, ?, 'a name', ?, 0)`,
    );

  const pinCases = (kind: keyof typeof SUBJECTS): void => {
    it(`stores and updates a ${kind} Pin`, () => {
      const [, into] = insertSubjects(SUBJECTS[kind].table);

      assert.doesNotThrow(() => {
        pinInsert(kind).run(kind, `a key for ${kind}`, into);
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
