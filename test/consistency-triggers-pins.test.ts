import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import { Instance } from "./instance.ts";

const BUSY_TIMEOUT_MS = 5000;

const ITEM_COLUMNS = "from_item_id, into_item_id, from_digest, into_digest";

describe("the Pin triggers hold which columns each Pin kind uses", () => {
  let instance: Instance;
  let database: DatabaseSync;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    database = new DatabaseSync(instance.databaseFile, { timeout: BUSY_TIMEOUT_MS });
    database.exec(`
      insert into tags (id, key, name) values (1, 'a', 'A');
      insert into topics (id, key, name) values (1, 'x', 'X');
      insert into items (id, source, kind, normalized_url, original_url, saved_at) values
        (1, 'article', 'article', 'u1', 'u1', 1), (2, 'article', 'article', 'u2', 'u2', 2);
    `);
  });

  after(async () => {
    database.close();
    await instance.close();
  });

  const insert = (kind: string, columns: string, values: readonly number[]) => () => {
    database
      .prepare(
        `insert into pins (kind, from_key, from_name, ${columns}, created_at) values (?, 'refused', 'a name', ${values.map(() => "?").join(", ")}, 0)`,
      )
      .run(kind, ...values);
  };

  const REFUSED = [
    ["a disagreement Pin without a token", "items-disagree", "from_item_id, into_item_id", [1, 2]],
    ["a disagreement Pin without an Item", "items-disagree", "from_digest, into_digest", [1, 2]],
    ["a disagreement Pin that names one Item twice", "items-disagree", ITEM_COLUMNS, [1, 1, 1, 2]],
    [
      "a disagreement Pin that names a Tag",
      "items-disagree",
      `${ITEM_COLUMNS}, into_tag_id`,
      [1, 2, 1, 2, 1],
    ],
    [
      "a disagreement Pin that names a Topic",
      "items-disagree",
      `${ITEM_COLUMNS}, into_topic_id`,
      [1, 2, 1, 2, 1],
    ],
    ["a Tag Pin that names an Item", "tag-merge", "into_tag_id, from_item_id", [1, 1]],
    ["a Topic Pin that holds a token", "topic-merge", "into_topic_id, into_digest", [1, 3]],
  ] as const;

  for (const [name, kind, columns, values] of REFUSED) {
    it(`refuses ${name} on insert`, () => {
      assert.throws(insert(kind, columns, values), /pins_subject/u);
    });
  }

  it("refuses an update that breaks a Pin of each kind", () => {
    insert("items-disagree", ITEM_COLUMNS, [1, 2, 1, 2])();
    database.exec(
      "insert into pins (kind, from_key, from_name, into_tag_id, created_at) values ('tag-merge', 'tag', 'a name', 1, 0)",
    );

    const update = (statement: string) => () => {
      database.exec(statement);
    };

    assert.throws(
      update("update pins set into_item_id = from_item_id where kind = 'items-disagree'"),
      /pins_subject/u,
    );
    assert.throws(
      update("update pins set into_tag_id = 1 where kind = 'items-disagree'"),
      /pins_subject/u,
    );
    assert.throws(
      update("update pins set from_digest = 3 where kind = 'tag-merge'"),
      /pins_subject/u,
    );
  });
});
