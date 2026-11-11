import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { eq } from "drizzle-orm";

import type { RelatedResult } from "../src/core/related-task.ts";
import { pickedOutcome } from "../src/core/related-write.ts";
import { digests as digestsTable } from "../src/core/schema.ts";
import { Instance } from "./instance.ts";
import {
  allEntries,
  commit,
  entryCount,
  lineOf,
  lines,
  openStored,
  startTask,
} from "./log-fixtures.ts";
import { exec, firstPickTask, paste, saveProvider, until } from "./related-fixtures.ts";

const SECRET_KEY = "0".repeat(64);

describe("an overview that drops a removed Item writes an overview entry without a model call", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  it("writes 0 added and 1 removed for the prune-only revision", async () => {
    const kept = await paste(instance, "kept", { title: "Kept", topic: "Removals" });
    const removed = await paste(instance, "removed", { title: "Removed", topic: "Removals" });

    exec(
      instance,
      "insert into topic_pages (topic_id, overview, revision, built_from, failure, updated_at) values ((select id from topics where key = 'removals'), ?, 1, (select json_group_array(json_object('item', item_id, 'digest', task_id)) from digests), null, ?)",
      `Only one Item matters [${String(kept)}]`,
      Date.now(),
    );
    await saveProvider(instance);
    assert.equal((await instance.send("DELETE", `/api/items/${String(removed)}`)).status, 204);
    assert.equal((await instance.send("POST", "/api/topics/removals/overview")).status, 202);

    const entries = await until(
      () => allEntries(instance),
      (all) => all.some(({ action }) => action === "overview"),
    );

    assert.deepEqual(
      entries.filter(({ action }) => action === "overview").map((entry) => lineOf(entry)),
      ["overview | Removals | 0 added, 1 removed"],
    );
  });
});

describe("the pick's guarded batch records a related entry only for a stored set with a pick", () => {
  let instance: Instance;
  let database: ReturnType<typeof openStored>;
  let source: number;
  let other: number;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    source = await paste(instance, "source", { title: "The source" });
    other = await paste(instance, "other", { title: "The other" });
    database = openStored(instance);
  });

  after(async () => {
    database.close();
    await instance.close();
  });

  const store = async (picks: RelatedResult["picks"]) => {
    const taskId = startTask(instance, source);

    const [digests] = await database.db
      .select({ item: digestsTable.itemId, task: digestsTable.taskId })
      .from(digestsTable)
      .where(eq(digestsTable.itemId, source));

    const [sentDigest] = await database.db
      .select({ task: digestsTable.taskId })
      .from(digestsTable)
      .where(eq(digestsTable.itemId, other));

    assert.ok(digests !== undefined && sentDigest !== undefined);

    const outcome = pickedOutcome(database.db, {
      versions: {
        source: { id: source, digest: digests.task },
        sent: [{ id: other, digest: sentDigest.task }],
      },
      taskId,
      result: { picks },
    });

    await commit(database.db, outcome.writes);
  };

  it("records nothing for an empty set", async () => {
    await store([]);
    assert.equal(entryCount(instance, "related"), 0);
  });

  it("records one entry with the count and the source's title for a stored set, and another for a replacement", async () => {
    await store([{ item: other, reason: "Same subject." }]);
    await store([{ item: other, reason: "Still the same subject." }]);
    assert.deepEqual(
      (await lines(instance)).filter((line) => line.startsWith("related")),
      ["related | The source | 1 picks", "related | The source | 1 picks"],
    );
  });

  it("removes the entries with the source Item and keeps the target's Log untouched", async () => {
    assert.equal((await instance.send("DELETE", `/api/items/${String(source)}`)).status, 204);
    assert.equal(entryCount(instance, "related"), 0);
  });
});

describe("a pick that the Provider refuses keeps the earlier set and writes no entry", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await paste(instance, "candidate", { title: "Refused pick candidate", tags: ["quasar"] });
    await saveProvider(instance);
  });

  after(() => instance.close());

  it("ends the AI task failed and leaves the Log without a related line", async () => {
    const id = await paste(instance, "refused", { title: "Refused pick source", tags: ["quasar"] });
    const task = await firstPickTask(instance, id);

    assert.equal(task.state, "failed");
    assert.equal(entryCount(instance, "related"), 0);
  });
});
