import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";

import { z } from "zod";

import {
  EXPORT_KEEP_MS,
  ExportStatusSchema,
  SETTLE_MS,
  StartedExportSchema,
} from "../src/core/contract/export-contract.ts";
import { SECOND_MS } from "../src/core/contract/time-units.ts";
import { listedKeys } from "../src/core/kernel/file-pages.ts";
import {
  type SavedLibrary,
  downloadedZip,
  readyExport,
  savedLibrary,
} from "./export-restore-fixtures.ts";
import { Instance } from "./instance.ts";
import { until } from "./related-fixtures.ts";
import { blockItemFiles, loggedAttempts, retryNow, unblockItemFiles } from "./restore-fixtures.ts";
import { exec, nextSweep, rows } from "./sqlite-fixtures.ts";
import { entriesOf, manifestOf } from "./zip-fixtures.ts";

describe("one Export exists at a time and a stopped slice is retried, then given up", () => {
  let instance: Instance;
  let library: SavedLibrary;

  const status = () => instance.read("GET", "/api/export", ExportStatusSchema);

  const startedWithoutText = async () => {
    await instance.send("DELETE", "/api/export");
    blockItemFiles(instance);

    return instance.send("POST", "/api/export");
  };

  const failed = () =>
    until(
      () => {
        retryNow(instance);

        return status();
      },
      ({ state }) => state === "failed",
    );

  const failedExport = async () => {
    const started = StartedExportSchema.parse(JSON.parse((await startedWithoutText()).body));

    return { id: started.id, status: await failed() };
  };

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    library = await savedLibrary(instance, { inlineText: 1, linkOnly: 39, fileText: 1 });
  });

  afterEach(() => {
    unblockItemFiles(instance);
  });

  after(() => instance.close());

  it("answers 409 to a second start while an Export runs", async () => {
    const started = await startedWithoutText();

    assert.equal(started.status, 202);
    assert.equal((await status()).state, "running");
    assert.equal((await instance.send("POST", "/api/export")).status, 409);

    await failed();
  });

  it("fails with gave-up after 3 attempts at a slice that cannot read a file", async (t) => {
    const attempts = loggedAttempts(t, "export");
    const { status: end } = await failedExport();

    assert.equal(end.state === "failed" ? end.failure : "", "gave-up");
    assert.deepEqual(attempts(), [1, 2, 3]);
  });

  it("keeps the stored slices of a failed Export", async () => {
    const { id } = await failedExport();
    const prefix = `exports/${String(id)}/`;

    assert.deepEqual(await listedKeys(instance.core.files, prefix), [
      `${prefix}dir-1-0`,
      `${prefix}part-1-0`,
    ]);
  });

  it("starts a new Export that completes after a failed one", async () => {
    const { id } = await failedExport();

    unblockItemFiles(instance);

    const again = await readyExport(instance);

    assert.notEqual(again.id, id);
    assert.equal(
      manifestOf(await entriesOf(await downloadedZip(instance, again.id))).tables["items"]?.rows,
      library.ids.length,
    );
  });

  it("deletes the objects of a failed Export 12 minutes after its last update, and not before", async () => {
    const { id } = await failedExport();
    const prefix = `exports/${String(id)}/`;

    unblockItemFiles(instance);
    assert.ok((await listedKeys(instance.core.files, prefix)).length > 0);

    exec(
      instance,
      "update exports set updated_at = ? where id = ?",
      Date.now() - SETTLE_MS + SECOND_MS,
      id,
    );
    await nextSweep(instance);
    assert.ok((await listedKeys(instance.core.files, prefix)).length > 0, "1 second short");

    exec(
      instance,
      "update exports set updated_at = ? where id = ?",
      Date.now() - SETTLE_MS - SECOND_MS,
      id,
    );
    await nextSweep(instance);
    assert.deepEqual(await listedKeys(instance.core.files, prefix), []);
    assert.deepEqual(
      rows(
        instance,
        z.object({ id: z.number(), state: z.string() }),
        "select id, state from exports where id = ?",
        id,
      ),
      [{ id, state: "expired" }],
    );
  });

  it("replaces a ready Export on a new start, deleting the old objects", async () => {
    const first = await readyExport(instance);
    const prefix = `exports/${String(first.id)}/`;

    assert.ok((await listedKeys(instance.core.files, prefix)).length > 0);

    const second = await readyExport(instance);

    assert.notEqual(second.id, first.id);
    assert.deepEqual(await listedKeys(instance.core.files, prefix), []);
  });

  it("answers 404 to the download of a replaced Export and 200 to the new one", async () => {
    const first = await readyExport(instance);
    const second = await readyExport(instance);

    assert.equal(
      (await instance.send("GET", `/api/export/${String(first.id)}/download`)).status,
      404,
    );
    assert.equal(
      (await instance.send("GET", `/api/export/${String(second.id)}/download`)).status,
      200,
    );
  });

  it("deletes a ready Export at once and answers 404 when none is left", async () => {
    const ready = await readyExport(instance);
    const prefix = `exports/${String(ready.id)}/`;

    assert.equal((await instance.send("DELETE", "/api/export")).status, 204);
    assert.deepEqual(await status(), { state: "none" });
    assert.deepEqual(await listedKeys(instance.core.files, prefix), []);
    assert.equal((await instance.send("DELETE", "/api/export")).status, 404);
  });

  it("removes at the next sweep an object a stalled slice wrote after the Export expired", async () => {
    const ready = await readyExport(instance);
    const prefix = `exports/${String(ready.id)}/`;

    await instance.send("DELETE", "/api/export");
    await instance.core.files.put(`${prefix}part-9-9`, new Uint8Array(1));
    await nextSweep(instance);
    assert.deepEqual(await listedKeys(instance.core.files, prefix), []);
  });

  it("keeps a ready Export 24 hours after it finished and removes it at the next sweep after that", async () => {
    const ready = await readyExport(instance);
    const prefix = `exports/${String(ready.id)}/`;

    exec(
      instance,
      "update exports set finished_at = ? where id = ?",
      Date.now() - EXPORT_KEEP_MS + SECOND_MS,
      ready.id,
    );
    await nextSweep(instance);
    assert.equal((await status()).state, "ready");
    assert.ok((await listedKeys(instance.core.files, prefix)).length > 0);

    exec(
      instance,
      "update exports set finished_at = ? where id = ?",
      Date.now() - EXPORT_KEEP_MS - SECOND_MS,
      ready.id,
    );
    await nextSweep(instance);
    assert.deepEqual(await status(), { state: "none" });
    assert.deepEqual(await listedKeys(instance.core.files, prefix), []);
  });
});
