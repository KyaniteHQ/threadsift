import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";

import {
  RestoreErrorSchema,
  RestoreStatusSchema,
  StartedRestoreSchema,
} from "../src/core/contract/restore-contract.ts";
import { Instance } from "./instance.ts";
import { holdLibrary, settledRestore } from "./restore-fixtures.ts";
import { refusal } from "./restoring-fixtures.ts";

const xLink = (id: number): string => `https://x.com/someone/status/${String(id)}`;

describe("a Restore that failed and still holds the library refuses a second upload", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  it("answers 409 restore-open for a gave-up run and accepts an upload after a refusal", async () => {
    holdLibrary(instance, "failed", "gave-up", "check");

    const refused = await instance.send("POST", "/api/restore", { bytes: 1, parts: 1 });

    assert.equal(refused.status, 409);
    assert.equal(RestoreErrorSchema.parse(JSON.parse(refused.body)).code, "restore-open");

    holdLibrary(instance, "failed", "no-manifest", "check");

    const accepted = await instance.send("POST", "/api/restore", { bytes: 1, parts: 1 });

    assert.equal(accepted.status, 201);
    const started = StartedRestoreSchema.parse(JSON.parse(accepted.body));
    const status = await instance.read("GET", "/api/restore", RestoreStatusSchema);

    assert.equal(status.state, "uploading");
    assert.deepEqual([started.id, status.id], [2, 2]);
  });
});

describe("a Restore that failed with other-release holds the library once it tallied a record, until the owner cancels it", () => {
  let instance: Instance;
  const link = { url: xLink(3600000020) };

  beforeEach(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  afterEach(() => instance.close());

  it("refuses a Paste and a second upload into a library that looks empty, and takes the Paste after Cancel", async () => {
    holdLibrary(instance, "failed", "other-release", "tables", '{"log_start":1}');

    const held = await instance.read("GET", "/api/restore", RestoreStatusSchema);

    assert.deepEqual(held.state === "failed" && [held.libraryEmpty, held.holdsLibrary], [
      true,
      true,
    ]);

    const upload = await instance.send("POST", "/api/restore", { bytes: 1, parts: 1 });

    assert.equal(upload.status, 409);
    assert.equal(RestoreErrorSchema.parse(JSON.parse(upload.body)).code, "restore-open");

    const refused = await instance.send("POST", "/api/items", link);

    assert.equal(refused.status, 503);
    assert.equal(refusal(refused).body.code, "restoring");

    assert.equal((await instance.send("DELETE", "/api/restore/1")).status, 202);
    await settledRestore(instance, ["cancelled"]);

    assert.equal((await instance.send("POST", "/api/items", link)).status, 201);
  });

  it("takes a Paste and an upload after an other-release failure that tallied nothing", async () => {
    holdLibrary(instance, "failed", "other-release", "check");

    const status = await instance.read("GET", "/api/restore", RestoreStatusSchema);

    assert.equal(status.state === "failed" && status.holdsLibrary, false);
    assert.equal((await instance.send("POST", "/api/items", link)).status, 201);

    instance.database.exec("delete from items");

    assert.equal((await instance.send("POST", "/api/restore", { bytes: 1, parts: 1 })).status, 201);
  });
});
