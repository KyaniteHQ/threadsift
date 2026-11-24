import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";

import { z } from "zod";

import { ExportStatusSchema, StartedExportSchema } from "../src/core/contract/export-contract.ts";
import {
  type SavedLibrary,
  bytesOfKey,
  downloadedZip,
  nextSweep,
  postTextKey,
  readyExport,
  savedLibrary,
  storedKeys,
} from "./export-restore-fixtures.ts";
import { Instance } from "./instance.ts";
import { exec, rows, until } from "./related-fixtures.ts";
import { loggedAttempts, retryNow } from "./restore-fixtures.ts";
import { entriesOf } from "./zip-fixtures.ts";

const MINUTE_MS = 60_000;

const HOUR_MS = 60 * MINUTE_MS;

describe("one Export exists at a time and a stopped slice is retried, then given up", () => {
  let instance: Instance;
  let library: SavedLibrary;
  let text: Uint8Array;

  const key = () => postTextKey(library.longTextIds[0] ?? 0);

  const status = () => instance.read("GET", "/api/export", ExportStatusSchema);

  const exportRows = () =>
    rows(
      instance,
      z.object({ id: z.number(), state: z.string() }),
      "select id, state from exports order by id",
    );

  const startedWithoutText = async () => {
    await instance.send("DELETE", "/api/export");
    await instance.core.files.delete([key()]);

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
    library = await savedLibrary(instance, { small: 1, linked: 39, long: 1 });
    text = await bytesOfKey(instance, key());
  });

  afterEach(async () => {
    await instance.core.files.put(key(), text);
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

    assert.ok(
      (await storedKeys(instance, `exports/${String(id)}/`)).length > 0,
      "the first slice stays stored while the Export is failed",
    );
  });

  it("starts a new Export that completes after a failed one", async () => {
    const { id } = await failedExport();

    await instance.core.files.put(key(), text);

    const again = await readyExport(instance);

    assert.notEqual(again.id, id);
    assert.ok((await entriesOf(await downloadedZip(instance, again.id))).size > 0);
  });

  it("deletes the objects of a failed Export 12 minutes after its last update, and not before", async () => {
    const { id } = await failedExport();
    const prefix = `exports/${String(id)}/`;

    assert.ok((await storedKeys(instance, prefix)).length > 0);

    exec(
      instance,
      "update exports set updated_at = ? where id = ?",
      Date.now() - 11 * MINUTE_MS,
      id,
    );
    await nextSweep(instance);
    assert.ok((await storedKeys(instance, prefix)).length > 0, "11 minutes old");

    exec(
      instance,
      "update exports set updated_at = ? where id = ?",
      Date.now() - 13 * MINUTE_MS,
      id,
    );
    await nextSweep(instance);
    assert.deepEqual(await storedKeys(instance, prefix), []);
    assert.deepEqual(
      exportRows().find((row) => row.id === id),
      { id, state: "expired" },
    );
  });

  it("replaces a ready Export on a new start, deleting the old objects", async () => {
    const first = await readyExport(instance);
    const prefix = `exports/${String(first.id)}/`;

    assert.ok((await storedKeys(instance, prefix)).length > 0);

    const second = await readyExport(instance);

    assert.notEqual(second.id, first.id);
    assert.deepEqual(await storedKeys(instance, prefix), []);
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
    assert.deepEqual(await storedKeys(instance, prefix), []);
    assert.equal((await instance.send("DELETE", "/api/export")).status, 404);
  });

  it("removes at the next sweep an object a stalled slice wrote after the Export expired", async () => {
    const ready = await readyExport(instance);
    const prefix = `exports/${String(ready.id)}/`;

    await instance.send("DELETE", "/api/export");
    await instance.core.files.put(`${prefix}part-9-9`, new Uint8Array(1));
    await nextSweep(instance);
    assert.deepEqual(await storedKeys(instance, prefix), []);
  });

  it("keeps a ready Export 24 hours after it finished and removes it at the next sweep after that", async () => {
    const ready = await readyExport(instance);
    const prefix = `exports/${String(ready.id)}/`;

    exec(
      instance,
      "update exports set finished_at = ? where id = ?",
      Date.now() - 23 * HOUR_MS,
      ready.id,
    );
    await nextSweep(instance);
    assert.equal((await status()).state, "ready");
    assert.ok((await storedKeys(instance, prefix)).length > 0);

    exec(
      instance,
      "update exports set finished_at = ? where id = ?",
      Date.now() - 25 * HOUR_MS,
      ready.id,
    );
    await nextSweep(instance);
    assert.deepEqual(await status(), { state: "none" });
    assert.deepEqual(await storedKeys(instance, prefix), []);
  });
});
