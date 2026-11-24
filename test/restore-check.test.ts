import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { RESTORE_REFUSALS, RestoreStatusSchema } from "../src/core/contract/restore-contract.ts";
import { exportedZip, savedLibrary, storedKeys } from "./export-restore-fixtures.ts";
import { Instance } from "./instance.ts";
import { until } from "./related-fixtures.ts";
import { VARIANTS } from "./restore-check-variants.ts";
import { settledRestore, startedRestore, uploadedRestore } from "./restore-fixtures.ts";
import { itemTotal } from "./restoring-fixtures.ts";
import { type Entries, entriesOf } from "./zip-fixtures.ts";

describe("the check refuses a zip it cannot trust before it writes a record", () => {
  let source: Instance;
  let target: Instance;
  let entries: Entries;
  let zip: Uint8Array;

  before(async () => {
    source = await Instance.start();
    await source.setUp();
    await savedLibrary(source, { small: 3, long: 0 });
    zip = await exportedZip(source);
    entries = await entriesOf(zip);
    target = await Instance.start();
    await target.setUp();
  });

  after(async () => {
    await source.close();
    await target.close();
  });

  it("has a test for every refusal code the Restore routes document", () => {
    const covered = new Set([...VARIANTS.map(([code]) => code), "incomplete-upload"]);

    assert.deepEqual(
      RESTORE_REFUSALS.filter((code) => !covered.has(code)),
      [],
    );
  });

  VARIANTS.forEach(([code, name, variant]) => {
    it(`fails with ${code} for ${name}, deletes the parts and leaves the library empty`, async () => {
      const bytes = await variant(entries, zip);
      const id = await startedRestore(target, bytes);
      const failed = await settledRestore(target, ["failed"]);

      assert.deepEqual(RestoreStatusSchema.parse(failed), {
        state: "failed",
        libraryEmpty: true,
        id,
        failure: code,
        resumable: false,
        cancelFailed: false,
      });
      await until(
        () => storedKeys(target, `restores/${String(id)}/`),
        (keys) => keys.length === 0,
      );
      assert.equal(await itemTotal(target), 0);
    });
  });

  it("fails with incomplete-upload when a stored part is shorter than announced, deletes the parts and leaves the library empty", async () => {
    const id = await uploadedRestore(target, zip);

    await target.core.files.put(`restores/${String(id)}/part-1`, zip.subarray(0, zip.length - 100));
    assert.equal((await target.send("POST", `/api/restore/${String(id)}/start`)).status, 202);

    const failed = await settledRestore(target, ["failed"]);

    assert.deepEqual(RestoreStatusSchema.parse(failed), {
      state: "failed",
      libraryEmpty: true,
      id,
      failure: "incomplete-upload",
      resumable: false,
      cancelFailed: false,
    });
    await until(
      () => storedKeys(target, `restores/${String(id)}/`),
      (keys) => keys.length === 0,
    );
    assert.equal(await itemTotal(target), 0);
  });

  it("accepts the unmodified zip after every refusal, because a refusal holds no library", async () => {
    const id = await startedRestore(target, zip);
    const done = await settledRestore(target, ["done", "failed"]);

    assert.equal(done.state, "done", JSON.stringify(done));
    assert.equal(done.state === "done" ? done.id : 0, id);
    assert.equal(await itemTotal(target), 3);
  });
});
