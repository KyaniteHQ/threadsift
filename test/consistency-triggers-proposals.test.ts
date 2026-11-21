import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import type { PinKind } from "../src/core/contract/proposal-contract.ts";
import { Instance } from "./instance.ts";
import { paste } from "./related-fixtures.ts";

const BUSY_TIMEOUT_MS = 5000;

type Subjects = Readonly<{ columns: readonly string[]; create: () => readonly number[] }>;

describe("Proposals and Pins refuse unknown values and mismatched subjects", () => {
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

  it("refuses a proposal with a kind or state the code does not list, on insert and on update", () => {
    const insert = database.prepare(
      "insert into proposals (kind, reason, state, created_at) values (?, 'a reason', ?, 0)",
    );

    assert.throws(() => insert.run("unknown", "open"), /proposals_values/u);
    assert.throws(() => insert.run("tag-merge", "unknown"), /proposals_values/u);

    const id = Number(insert.run("tag-merge", "open").lastInsertRowid);
    const update = database.prepare("update proposals set kind = ?, state = ? where id = ?");

    assert.throws(() => update.run("unknown", "open", id), /proposals_values/u);
    assert.throws(() => update.run("tag-merge", "unknown", id), /proposals_values/u);
  });

  it("refuses a state that only a merge kind holds on any other kind", () => {
    const insert = database.prepare(
      "insert into proposals (kind, reason, state, created_at) values ('overview-gap', 'a reason', ?, 0)",
    );

    assert.throws(() => insert.run("declined"), /proposals_state_check/u);
    assert.throws(() => insert.run("accepting"), /proposals_state_check/u);
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
