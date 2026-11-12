import assert from "node:assert/strict";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { sql } from "drizzle-orm";

import { TOPIC_KIND, topicMoves } from "../src/core/catalog-key-links.ts";
import { guardedBatch } from "../src/core/guards.ts";
import { readRewrite } from "../src/core/tag-rewrite.ts";
import { openDatabase } from "../src/targets/node/database.ts";
import { Instance } from "./instance.ts";
import { dump, item, script } from "./pin-fixtures.ts";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");

describe("a Tag rewrite that read a Digest before a Topic rewrite changed it", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    script(
      instance,
      `
      insert into tags (id, key, name) values (1, 'machine learning', 'machine learning'), (2, 'ml', 'ml');
      insert into topics (id, key, name) values (1, 'reading', 'Reading'), (2, 'old', 'Old');
      ${item(1, [2], ["ml"], { topic: "Old", topicId: 2 })}`,
    );
  });

  after(() => instance.close());

  it("keeps the Topic name the Topic rewrite wrote and still renames the Tag", async () => {
    const database = openDatabase(instance.databaseFile, MIGRATIONS);

    try {
      const unit = await readRewrite(database.db, {
        from: { id: 2, key: "ml", name: "ml" },
        into: { id: 1, key: "machine learning", name: "machine learning" },
        after: 0,
      });

      const moves = await TOPIC_KIND.linked(database.db, 2);

      await guardedBatch(database.db, sql`1`, topicMoves(database.db, 2, 1, moves));
      await guardedBatch(database.db, sql`1`, unit.writes);
    } finally {
      database.close();
    }

    assert.equal(
      dump(
        instance,
        "select topic, json_extract(digest, '$.topic') as json_topic, json_extract(digest, '$.tags') as tags from digests where item_id = 1",
      ),
      JSON.stringify([
        { topic: "Reading", json_topic: "Reading", tags: JSON.stringify(["machine learning"]) },
      ]),
    );
  });
});
