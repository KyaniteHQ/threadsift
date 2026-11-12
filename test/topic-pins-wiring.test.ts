import assert from "node:assert/strict";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { sql } from "drizzle-orm";

import { publishing, readForPublishing } from "../src/core/digest-publish.ts";
import { guardedBatch } from "../src/core/guards.ts";
import { readOlderDigestLink } from "../src/core/older-digests.ts";
import { openDatabase } from "../src/targets/node/database.ts";
import { Instance } from "./instance.ts";
import { item, script, storedDigestOf, topicNameOf } from "./pin-fixtures.ts";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");

const topicPin = (id: number, into: number) =>
  `insert into pins (id, kind, from_key, from_name, into_topic_id, created_at) values (${String(id)}, 'topic-merge', 'ml', 'ML', ${String(into)}, 1);`;

const published = { title: "T", topic: "ML", tags: [], summary: "S", keyPoints: ["K"] };

const runningTask = (id: number, itemId: number) =>
  `insert into ai_tasks (id, kind, inputs, input_revision, executor, attempts, deadline, state, item_id)
     values (${String(id)}, 'digest', '{}', 0, 'caller', 1, 0, 'running', ${String(itemId)});`;

describe("each publication path refuses its batch when a Topic Pin appeared after it read the Pins", () => {
  let instance: Instance;
  let database: ReturnType<typeof openDatabase>;

  const sqlite = (statement: string) => {
    script(instance, statement);
  };

  const publication = async (itemId: number, taskId: number) => {
    const { item: input, anchors } = await readForPublishing(database.db, itemId);

    assert.ok(input);

    const outcome = await publishing(
      database.db,
      input,
      published,
      taskId,
      { executor: "caller" },
      anchors,
    );

    assert.ok("writes" in outcome);

    return outcome.writes;
  };

  const unlinkedDigest = (itemId: number) =>
    readOlderDigestLink(database.db, { id: itemId, digest: storedDigestOf(instance, itemId) });

  before(async () => {
    instance = await Instance.start();
    sqlite(`
      insert into topics (id, key, name) values (1, 'machine learning', 'Machine Learning');
      ${item(1, [], [], { topic: "Reading" })}
      ${item(2, [], [], { topic: "Reading" })}
      ${item(3, [], [], { topic: "ML" })}
      ${item(4, [], [], { topic: "ML" })}
      update items set topic_id = null where id in (1, 2);
      ${runningTask(101, 1)}
      ${runningTask(102, 2)}`);
    database = openDatabase(instance.databaseFile, MIGRATIONS);
  });

  after(async () => {
    database.close();
    await instance.close();
  });

  it("commits the publication batch of Digest publication while no Pin changed", async () => {
    const writes = await publication(1, 101);

    assert.equal(await guardedBatch(database.db, sql`1`, writes), true);
    assert.equal(topicNameOf(instance, 1), "ML");
  });

  it("refuses the publication batch of Digest publication when the Pin appeared after the read", async () => {
    const writes = await publication(2, 102);

    sqlite(topicPin(1, 1));

    await assert.rejects(guardedBatch(database.db, sql`1`, writes), /guards_hold/u);
    assert.equal(topicNameOf(instance, 2), null);
  });

  it("commits the older-Digest link while no Pin changed", async () => {
    sqlite("delete from pins");

    const { condition, writes } = await unlinkedDigest(3);

    assert.equal(await guardedBatch(database.db, condition, writes), true);
    assert.equal(topicNameOf(instance, 3), "ML");
  });

  it("refuses the older-Digest link when the Pin appeared after the read", async () => {
    const { condition, writes } = await unlinkedDigest(4);

    sqlite(topicPin(1, 1));

    assert.equal(await guardedBatch(database.db, condition, writes), false);
    assert.equal(topicNameOf(instance, 4), null);
  });
});
