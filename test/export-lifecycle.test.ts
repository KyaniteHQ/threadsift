import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";

import { ExportStatusSchema, StartedExportSchema } from "../src/core/contract/export-contract.ts";
import { DAY_MS, MINUTE_MS } from "../src/core/contract/time-units.ts";
import {
  type SavedLibrary,
  downloadedZip,
  firstLongText,
  readyExport,
  savedLibrary,
} from "./export-restore-fixtures.ts";
import { bytesOfKey, exportKeys, postTextKey } from "./file-store-fixtures.ts";
import { Instance } from "./instance.ts";
import { until, rowCount, exec, nextSweep, sweptWith } from "./related-fixtures.ts";
import { loggedAttempts, retryNow } from "./restore-fixtures.ts";
import { entriesOf, manifestOf } from "./zip-fixtures.ts";

describe("one Export exists at a time and a stopped slice is retried, then given up", () => {
  let instance: Instance;
  let library: SavedLibrary;
  let text: Uint8Array;

  const key = () => postTextKey(firstLongText(library).id);

  const status = () => instance.read("GET", "/api/export", ExportStatusSchema);

  const sweptAfter = (column: "updated_at" | "finished_at", id: number, ageMs: number) =>
    sweptWith(instance, (now) => {
      exec(instance, `update exports set ${column} = ? where id = ?`, now - ageMs, id);
    });

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
    library = await savedLibrary(instance, { inlineText: 1, linkOnly: 39, fileText: 1 });
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

    assert.ok(end.state === "failed", `the Export failed, not ${end.state}`);
    assert.equal(end.failure, "gave-up");
    assert.deepEqual(attempts(), [1, 2, 3]);
  });

  it("starts a new Export that completes after a failed one", async () => {
    const { id } = await failedExport();

    await instance.core.files.put(key(), text);

    const again = await readyExport(instance);

    assert.notEqual(again.id, id);
    assert.equal(
      manifestOf(await entriesOf(await downloadedZip(instance, again.id))).tables["items"]?.rows,
      library.ids.length,
    );
  });

  it("deletes the objects of a failed Export 12 minutes after its last update, and not before", async () => {
    const { id } = await failedExport();

    assert.ok((await exportKeys(instance, id)).length > 0);

    await sweptAfter("updated_at", id, 12 * MINUTE_MS);
    assert.ok((await exportKeys(instance, id)).length > 0, "12 minutes old");

    await sweptAfter("updated_at", id, 12 * MINUTE_MS + 1);
    assert.deepEqual(await exportKeys(instance, id), []);
    assert.equal(rowCount(instance, "exports", "id = ? and state = 'expired'", id), 1);
  });

  it("replaces a ready Export on a new start, deleting the old objects, and answers 404 to the old download and 200 to the new one", async () => {
    const first = await readyExport(instance);

    assert.ok((await exportKeys(instance, first.id)).length > 0);

    const second = await readyExport(instance);

    assert.notEqual(second.id, first.id);
    assert.deepEqual(await exportKeys(instance, first.id), []);
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

    assert.equal((await instance.send("DELETE", "/api/export")).status, 204);
    assert.deepEqual(await status(), { state: "none" });
    assert.deepEqual(await exportKeys(instance, ready.id), []);
    assert.equal((await instance.send("DELETE", "/api/export")).status, 404);
  });

  it("removes at the next sweep an object a stalled slice wrote after the Export expired", async () => {
    const ready = await readyExport(instance);
    const prefix = `exports/${String(ready.id)}/`;

    await instance.send("DELETE", "/api/export");
    await instance.core.files.put(`${prefix}part-9-9`, new Uint8Array(1));
    await nextSweep(instance);
    assert.deepEqual(await exportKeys(instance, ready.id), []);
  });

  it("keeps a ready Export 24 hours after it finished and removes it at the next sweep after that", async () => {
    const ready = await readyExport(instance);

    await sweptAfter("finished_at", ready.id, DAY_MS);
    assert.equal((await status()).state, "ready");
    assert.ok((await exportKeys(instance, ready.id)).length > 0);

    await sweptAfter("finished_at", ready.id, DAY_MS + 1);
    assert.deepEqual(await status(), { state: "none" });
    assert.deepEqual(await exportKeys(instance, ready.id), []);
  });
});
