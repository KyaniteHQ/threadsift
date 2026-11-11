import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { DigestSchema } from "../src/core/ai-contract.ts";
import { publishing, readForPublishing } from "../src/core/digest-publish.ts";
import { Instance } from "./instance.ts";
import { commit, entryCount, openStored, startTask } from "./log-fixtures.ts";
import { exec, paste } from "./related-fixtures.ts";

describe("a publication that the guard discards appends no entry, and a delivered batch cannot append twice", () => {
  let instance: Instance;
  let database: ReturnType<typeof openStored>;
  let id: number;

  const digest = {
    title: "Replaced",
    topic: "Reading",
    tags: [],
    summary: "A summary.",
    keyPoints: ["A point"],
  };

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    id = await paste(instance, "guarded", { title: "First", topic: "Reading" });
    database = openStored(instance);
  });

  after(async () => {
    database.close();
    await instance.close();
  });

  const publication = async (taskId: number) => {
    const { item, anchors } = await readForPublishing(database.db, id);

    assert.ok(item !== undefined);

    const outcome = await publishing(
      database.db,
      item,
      DigestSchema.parse(digest),
      taskId,
      { executor: "caller" },
      anchors,
    );

    assert.ok("writes" in outcome);

    return outcome;
  };

  it("appends nothing when the Item's content moved on after the read", async () => {
    const stale = await publication(startTask(instance, id));

    exec(instance, "update items set generation = generation + 1 where id = ?", id);

    const countBefore = entryCount(instance, "digest");

    await assert.rejects(commit(database.db, stale.writes));
    assert.equal(entryCount(instance, "digest"), countBefore);
  });

  it("appends one entry when delivered twice, because the task is no longer running the second time", async () => {
    const delivered = await publication(startTask(instance, id));
    const countBefore = entryCount(instance, "digest");

    await commit(database.db, delivered.writes);
    await assert.rejects(commit(database.db, delivered.writes));
    assert.equal(entryCount(instance, "digest"), countBefore + 1);
  });
});
