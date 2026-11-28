import assert from "node:assert/strict";
import { type TestContext, afterEach, before, beforeEach, describe, it } from "node:test";

import { RESTORE_SETTLE_MS } from "../src/core/contract/restore-contract.ts";
import { Instance } from "./instance.ts";
import {
  CHANGED_TEXT,
  cancelledWhileHeld,
  doneAfterRetries,
  heldWrite,
  inFiles,
  itemKeys,
  keysAfterSweep,
  lateWriteZips,
  restoreAttemptFailures,
  settledOlderRestores,
  startedToFiles,
} from "./late-write-fixtures.ts";
import { until } from "./library-fixtures.ts";

describe("a cancelled Restore's files unit that writes late", () => {
  let zips: Awaited<ReturnType<typeof lateWriteZips>>;
  let target: Instance;

  before(async () => {
    zips = await lateWriteZips();
  });

  beforeEach(async () => {
    target = await Instance.start();
    await target.setUp();
  });

  afterEach(() => target.close());

  const holdingKey = (t: TestContext) =>
    heldWrite(t, target, (name) => name === zips.key && inFiles(target, 1));

  it("keeps a write that was in flight at the Cancel off the next Restore's post text file", async (t) => {
    const held = holdingKey(t);

    await cancelledWhileHeld(target, zips.first, held.reached);
    await startedToFiles(target, zips.second);
    held.release();
    await held.landed;
    settledOlderRestores(target);
    await doneAfterRetries(target);

    assert.equal((await target.detail(zips.itemId)).postText, CHANGED_TEXT);
  });

  it("starts no write after its unit's deadline, even once the next Restore is done", async (t) => {
    const failed = restoreAttemptFailures(t);
    const held = heldWrite(t, target, (name) => name.startsWith("items/") && inFiles(target, 1));

    await cancelledWhileHeld(target, zips.first, held.reached);
    await startedToFiles(target, zips.second);

    const now = Date.now.bind(Date);

    t.mock.method(Date, "now", () => now() + RESTORE_SETTLE_MS);
    await doneAfterRetries(target);

    const startedBefore = held.started.length;

    held.release();
    await held.landed;
    await until(
      "the late unit fails or starts another write",
      () => Promise.resolve(failed().length + held.started.length - startedBefore),
      (count) => count > 0,
    );

    assert.deepEqual(held.started.slice(startedBefore), []);
  });

  it("removes a late write that the next zip has no entry for, also when the next Restore's first files unit runs twice", async (t) => {
    const held = holdingKey(t);

    await cancelledWhileHeld(target, zips.first, held.reached);
    held.release();
    await held.landed;
    assert.ok((await itemKeys(target, zips.itemId)).includes(zips.key));

    const write = target.core.files.put.bind(target.core.files);
    let crashed = false;

    t.mock.method(target.core.files, "put", async (name: string, bytes: Uint8Array) => {
      if (!crashed && inFiles(target, 2)) {
        crashed = true;
        throw new Error("the first files unit stops after the clear");
      }

      await write(name, bytes);
    });
    await startedToFiles(target, zips.withoutKey);
    settledOlderRestores(target);
    await doneAfterRetries(target);

    assert.equal(crashed, true);
    assert.deepEqual(await itemKeys(target, zips.itemId), []);
    assert.ok((await itemKeys(target, zips.otherItemId)).includes(zips.otherKey));
  });

  it("leaves a late write after a Cancel with no next Restore to the file sweep, which removes it", async (t) => {
    const held = holdingKey(t);

    await cancelledWhileHeld(target, zips.first, held.reached);
    held.release();
    await held.landed;
    assert.ok((await itemKeys(target, zips.itemId)).includes(zips.key));

    assert.deepEqual(await keysAfterSweep(target, zips.itemId), []);
  });
});
