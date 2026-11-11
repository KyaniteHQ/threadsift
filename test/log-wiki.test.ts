import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Instance } from "./instance.ts";
import { allEntries, lineOf } from "./log-fixtures.ts";
import { exec, paste, saveProvider, until } from "./related-fixtures.ts";

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
