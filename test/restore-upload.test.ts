import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { RestoreErrorSchema, StartedRestoreSchema } from "../src/core/contract/restore-contract.ts";
import { listedKeys } from "../src/core/kernel/file-pages.ts";
import { exportedZip, savedLibrary } from "./export-restore-fixtures.ts";
import { Instance } from "./instance.ts";
import { putPart, restoreStatus, settledRestore } from "./restore-fixtures.ts";
import { exec } from "./sqlite-fixtures.ts";

const codeOf = (body: string) => RestoreErrorSchema.parse(JSON.parse(body)).code;

describe("an upload that is not whole or not allowed is refused before the check", () => {
  let source: Instance;
  let target: Instance;
  let zip: Uint8Array;

  before(async () => {
    source = await Instance.start();
    await source.setUp();
    await savedLibrary(source, { inlineText: 2, fileText: 0 });
    zip = await exportedZip(source);
    target = await Instance.start();
    await target.setUp();
  });

  after(async () => {
    await source.close();
    await target.close();
  });

  it("answers 409 library-not-empty for an Instance that holds Items", async () => {
    const refused = await source.send("POST", "/api/restore", { bytes: zip.length, parts: 1 });

    assert.equal(refused.status, 409);
    assert.equal(codeOf(refused.body), "library-not-empty");
  });

  it("answers 400 when parts is not bytes divided by the part size, rounded up", async () => {
    const refused = await target.send("POST", "/api/restore", { bytes: 100, parts: 2 });

    assert.equal(refused.status, 400);
    assert.equal((await restoreStatus(target)).state, "none");
  });

  const created = async () => {
    const answer = await target.send("POST", "/api/restore", { bytes: zip.length, parts: 1 });

    assert.equal(answer.status, 201);

    return StartedRestoreSchema.parse(JSON.parse(answer.body)).id;
  };

  const cancelled = async (id: number) => {
    assert.equal((await target.send("DELETE", `/api/restore/${String(id)}`)).status, 204);
  };

  it("refuses a part of the wrong length with 400 and keeps the upload open with no part received", async () => {
    const id = await created();

    assert.equal((await putPart(target, { id, part: 1 }, zip.slice(1))).status, 400);

    const status = await restoreStatus(target);

    assert.equal(status.state, "uploading");
    assert.deepEqual(status.state === "uploading" ? status.received : null, []);
    await cancelled(id);
  });

  it("refuses a start while a part is missing with 400 incomplete-upload", async () => {
    const id = await created();
    const started = await target.send("POST", `/api/restore/${String(id)}/start`);

    assert.equal(started.status, 400);
    assert.equal(codeOf(started.body), "incomplete-upload");
    await cancelled(id);
  });

  it("refuses a second upload with 409 restore-open while one is open", async () => {
    const id = await created();
    const second = await target.send("POST", "/api/restore", { bytes: 1, parts: 1 });

    assert.equal(second.status, 409);
    assert.equal(codeOf(second.body), "restore-open");
    await cancelled(id);
  });

  it("answers 404 to a part of a Restore that does not exist", async () => {
    assert.equal((await target.send("PUT", "/api/restore/9999/parts/1")).status, 404);
  });

  it("accepts the same part twice and starts once", async () => {
    const id = await created();

    assert.equal((await putPart(target, { id, part: 1 }, zip)).status, 204);
    assert.equal((await putPart(target, { id, part: 1 }, zip)).status, 204);

    const received = await restoreStatus(target);

    assert.deepEqual(received.state === "uploading" ? received.received : null, [1]);
    assert.equal((await target.send("POST", `/api/restore/${String(id)}/start`)).status, 202);
    assert.equal((await target.send("POST", `/api/restore/${String(id)}/start`)).status, 409);
    assert.equal((await settledRestore(target, ["done"])).state, "done");
  });
});

describe("a part that arrives after its Restore left the upload is not kept", () => {
  let target: Instance;
  let zip: Uint8Array;

  before(async () => {
    const source = await Instance.start();

    await source.setUp();
    await savedLibrary(source, { inlineText: 1, fileText: 0 });
    zip = await exportedZip(source);
    await source.close();
    target = await Instance.start();
    await target.setUp();
  });

  after(() => target.close());

  it("deletes a part that finished its write after the Restore was cancelled", async (t) => {
    const { id } = await target.read("POST", "/api/restore", StartedRestoreSchema, {
      bytes: zip.length,
      parts: 1,
    });

    const stored = target.core.files.put.bind(target.core.files);

    const put = t.mock.method(
      target.core.files,
      "put",
      async (...args: Parameters<typeof stored>) => {
        await stored(...args);
        exec(target, "update restores set state = 'cancelled' where id = ?", id);
      },
    );

    const late = await putPart(target, { id, part: 1 }, zip);

    assert.equal(late.status, 409);
    assert.equal(codeOf(await late.text()), "not-uploading");
    assert.equal(put.mock.callCount(), 1);
    assert.deepEqual(await listedKeys(target.core.files, `restores/${String(id)}/`), []);
  });

  it("answers 409 not-uploading to a part of a Restore that was cancelled before the write", async () => {
    const { id } = await target.read("POST", "/api/restore", StartedRestoreSchema, {
      bytes: zip.length,
      parts: 1,
    });

    assert.equal((await target.send("DELETE", `/api/restore/${String(id)}`)).status, 204);

    const late = await putPart(target, { id, part: 1 }, zip);

    assert.equal(late.status, 409);
    assert.equal(codeOf(await late.text()), "not-uploading");
    assert.deepEqual(await listedKeys(target.core.files, `restores/${String(id)}/`), []);
  });
});
