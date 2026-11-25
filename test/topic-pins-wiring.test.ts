import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { sql } from "drizzle-orm";

import { guardedBatch, refusedByGuard } from "../src/core/kernel/guards.ts";
import {
  publishedByCaller,
  readForPublishing,
} from "../src/features/digest/core/digest-publish.ts";
import { openMigrated } from "./instance-database.ts";
import { Instance } from "./instance.ts";
import { item, topicNameOf, topicPin } from "./pin-fixtures.ts";

const published = { title: "T", topic: "ML", tags: [], summary: "S", keyPoints: ["K"] };

const runningTask = (id: number, itemId: number) =>
  `insert into ai_tasks (id, kind, inputs, input_revision, executor, attempts, deadline, state, item_id)
     values (${String(id)}, 'digest', '{}', 0, 'caller', 1, 0, 'running', ${String(itemId)});`;

describe("each publication path refuses its batch when a Topic Pin appeared after it read the Pins", () => {
  let instance: Instance;
  let database: ReturnType<typeof openMigrated>;

  const sqlite = (statement: string) => {
    instance.database.script(statement);
  };

  const publication = async (itemId: number, taskId: number) => {
    const { item: input, anchors } = await readForPublishing(database.db, itemId);

    assert.ok(input);

    const outcome = await publishedByCaller(database.db, input, published, { taskId, anchors });

    assert.ok("writes" in outcome);

    return outcome.writes;
  };

  before(async () => {
    instance = await Instance.start();
    sqlite(`
      insert into topics (id, key, name) values (1, 'machine learning', 'Machine Learning');
      ${item(1, [], [], { topic: "Reading" })}
      ${item(2, [], [], { topic: "Reading" })}
      update items set topic_id = null where id in (1, 2);
      ${runningTask(101, 1)}
      ${runningTask(102, 2)}`);
    database = openMigrated(instance.databaseFile);
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

    await assert.rejects(guardedBatch(database.db, sql`1`, writes), refusedByGuard);
    assert.equal(topicNameOf(instance, 2), null);
  });
});
