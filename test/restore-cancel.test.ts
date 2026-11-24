import assert from "node:assert/strict";
import { type TestContext, after, afterEach, before, beforeEach, describe, it } from "node:test";

import { RestoreErrorSchema, restoreAnswerSchema } from "../src/core/contract/restore-contract.ts";
import {
  exportedZip,
  longPostText,
  nextSweep,
  savedLibrary,
  storedKeys,
} from "./export-restore-fixtures.ts";
import { Instance } from "./instance.ts";
import { count, exec, paste } from "./related-fixtures.ts";
import {
  gaveUpInFiles,
  restoreStatus,
  settledAfterRetries,
  settledRestore,
  startedRestore,
  unblockItemFiles,
  uploadedRestore,
} from "./restore-fixtures.ts";

const TEXT = new TextEncoder();

const DAY_MS = 24 * 60 * 60 * 1000;

const AnswerSchema = restoreAnswerSchema(
  "finished",
  "superseded",
  "not-resumable",
  "incomplete-upload",
);

const rowsIn = (instance: Instance, table: string) =>
  count(instance, `select count(*) as n from ${table}`);

describe("the owner cancels, resumes and undoes a Restore", () => {
  let source: Instance;
  let zip: Uint8Array;
  let longId: number;
  let target: Instance;

  before(async () => {
    source = await Instance.start();
    await source.setUp();

    const library = await savedLibrary(source, { small: 1, long: 1 });

    longId = library.longTextIds[0] ?? 0;
    zip = await exportedZip(source);
  });

  after(() => source.close());

  beforeEach(async () => {
    target = await Instance.start();
    await target.setUp();
  });

  afterEach(() => target.close());

  const send = (method: string, id: number, action = "") =>
    target.send(method, `/api/restore/${String(id)}${action}`);

  it("cancels an upload at once, deletes its parts, and cancels again with 204", async () => {
    const id = await uploadedRestore(target, zip);

    assert.deepEqual(await storedKeys(target, `restores/${String(id)}/`), [
      `restores/${String(id)}/part-1`,
    ]);
    assert.equal((await send("DELETE", id)).status, 204);
    assert.equal((await restoreStatus(target)).state, "cancelled");
    assert.deepEqual(await storedKeys(target, `restores/${String(id)}/`), []);
    assert.equal((await send("DELETE", id)).status, 204);
    assert.equal((await target.send("POST", "/api/restore", { bytes: 1, parts: 1 })).status, 201);
  });

  it("cancels a Restore that the check refused with 204 and shows it cancelled", async () => {
    const refused = await startedRestore(target, TEXT.encode("this is not a zip"));

    assert.equal((await settledRestore(target, ["failed"])).state, "failed");
    assert.equal((await send("DELETE", refused)).status, 204);
    assert.deepEqual(await restoreStatus(target), {
      state: "cancelled",
      libraryEmpty: true,
      id: refused,
    });
  });

  it("leaves an Item saved after the check refused the Restore when the owner cancels it", async () => {
    const refused = await startedRestore(target, TEXT.encode("this is not a zip"));

    assert.equal((await settledRestore(target, ["failed"])).state, "failed");

    const saved = await paste(target, "after-refusal", { title: "Saved after the refusal" });

    assert.equal((await send("DELETE", refused)).status, 204);
    assert.equal((await target.detail(saved)).id, saved);
    assert.equal(rowsIn(target, "items"), 1);
  });

  it("answers 409 superseded to a Cancel and a Resume of an older Restore, and leaves the newer upload open", async () => {
    const older = await startedRestore(target, TEXT.encode("this is not a zip"));

    assert.equal((await settledRestore(target, ["failed"])).state, "failed");

    const newer = await uploadedRestore(target, zip);
    const cancel = await send("DELETE", older);
    const resume = await send("POST", older, "/resume");

    assert.deepEqual([cancel.status, resume.status], [409, 409]);
    assert.deepEqual(
      [cancel.body, resume.body].map((body) => AnswerSchema.parse(JSON.parse(body)).code),
      ["superseded", "superseded"],
    );

    const status = await restoreStatus(target);

    assert.equal(status.state === "uploading" ? status.id : null, newer);
  });

  it("gives up a unit after 3 failed attempts and keeps the rows it wrote", async (t) => {
    await gaveUpInFiles(t, target, zip);

    const held = await restoreStatus(target);

    assert.equal(held.state === "failed" ? held.libraryEmpty : null, false);
    assert.equal(rowsIn(target, "items"), 2);
  });

  it("keeps the library closed to a Paste and a new upload after a Restore gave up, and keeps its parts", async (t) => {
    const id = await gaveUpInFiles(t, target, zip);

    const paste503 = await target.send("POST", "/api/items", {
      url: "https://x.com/someone/status/3500000001",
    });

    assert.equal(paste503.status, 503);
    assert.equal((await target.send("POST", "/api/restore", { bytes: 1, parts: 1 })).status, 409);
    assert.deepEqual(await storedKeys(target, `restores/${String(id)}/`), [
      `restores/${String(id)}/part-1`,
    ]);
  });

  it("resumes from the cursor of the last unit, so no table is written twice", async (t) => {
    const id = await gaveUpInFiles(t, target, zip);

    unblockItemFiles(target);
    assert.equal((await send("POST", id, "/resume")).status, 202);

    const done = await settledRestore(target, ["done", "failed"]);

    assert.ok(done.state === "done", JSON.stringify(done));
    assert.equal(done.restored["items"], 2);
    assert.equal(done.dropped["items"] ?? 0, 0);
    assert.ok(Object.values(done.dropped).every((dropped) => dropped === 0));
    assert.equal(done.files, 1);
    assert.equal((await target.detail(longId)).postText, longPostText(`item-${String(longId)}`));
  });

  it("opens the library to a Paste once a resumed Restore is done", async (t) => {
    const id = await gaveUpInFiles(t, target, zip);

    unblockItemFiles(target);
    assert.equal((await send("POST", id, "/resume")).status, 202);
    assert.equal((await settledRestore(target, ["done", "failed"])).state, "done");
    assert.equal(
      (await target.send("POST", "/api/items", { url: "https://x.com/someone/status/3500000001" }))
        .status,
      201,
    );
  });

  it("checks the release again before a unit, so a newer migration ends a resumed Restore with other-release before it writes a file", async (t) => {
    const id = await gaveUpInFiles(t, target, zip);

    unblockItemFiles(target);
    exec(target, "insert into d1_migrations (name) values ('9999_newer.sql')");
    assert.equal((await send("POST", id, "/resume")).status, 202);

    const failed = await settledRestore(target, ["failed", "done"]);

    assert.equal(failed.state === "failed" ? failed.failure : failed.state, "other-release");
    assert.deepEqual(await storedKeys(target, "items/"), []);
    assert.equal(rowsIn(target, "items"), 2);
  });

  const undone = async (t: TestContext) => {
    const id = await gaveUpInFiles(t, target, zip);

    unblockItemFiles(target);
    await target.core.files.put(
      "items/1/post-9-9.md",
      TEXT.encode("an object that a unit put while the cancel started"),
    );

    assert.equal((await send("DELETE", id)).status, 202);

    const cancelled = await settledRestore(target, ["cancelled", "failed"]);

    assert.equal(cancelled.state, "cancelled", JSON.stringify(cancelled));
    assert.equal(cancelled.libraryEmpty, true);

    return id;
  };

  it("undoes a Restore that gave up by deleting the restored rows and keeping the Log start and the catalog version", async (t) => {
    await undone(t);

    for (const table of ["items", "topics", "tags", "digests", "log_entries", "ai_tasks"]) {
      assert.equal(rowsIn(target, table), 0, table);
    }

    assert.equal(rowsIn(target, "log_start"), 1);
    assert.equal(rowsIn(target, "catalog_version"), 1);
  });

  it("undoes a Restore that gave up by deleting every file under items/ and its parts", async (t) => {
    const id = await undone(t);

    assert.deepEqual(await storedKeys(target, "items/"), []);
    assert.deepEqual(await storedKeys(target, `restores/${String(id)}/`), []);
  });

  it("frees the library for a new upload once an undo is done", async (t) => {
    await undone(t);
    assert.equal((await target.send("POST", "/api/restore", { bytes: 1, parts: 1 })).status, 201);
  });

  it("shows cancelFailed when an undo gives up, refuses to resume it, and finishes at the next Cancel", async (t) => {
    const id = await gaveUpInFiles(t, target, zip);
    const cancel = await send("DELETE", id);

    assert.equal(cancel.status, 202);

    const failed = await settledAfterRetries(target, ["failed"]);

    assert.deepEqual(
      failed.state === "failed" ? [failed.failure, failed.cancelFailed, failed.resumable] : null,
      ["gave-up", true, false],
    );

    const resume = await send("POST", id, "/resume");

    assert.equal(resume.status, 409);
    assert.equal(AnswerSchema.parse(JSON.parse(resume.body)).code, "not-resumable");

    unblockItemFiles(target);
    assert.equal((await send("DELETE", id)).status, 202);
    assert.equal((await settledRestore(target, ["cancelled", "failed"])).state, "cancelled");
    assert.equal(rowsIn(target, "items"), 0);
  });

  it("deletes the parts of a Restore that gave up 24 hours after its last update, and then refuses to resume it", async (t) => {
    const id = await gaveUpInFiles(t, target, zip);

    exec(target, "update restores set updated_at = ? where id = ?", Date.now() - DAY_MS - 1000, id);
    await nextSweep(target);
    assert.deepEqual(await storedKeys(target, `restores/${String(id)}/`), []);

    const status = await restoreStatus(target);

    assert.equal(status.state === "failed" ? status.resumable : null, false);

    const resume = await send("POST", id, "/resume");

    assert.equal(resume.status, 400);
    assert.equal(RestoreErrorSchema.parse(JSON.parse(resume.body)).code, "incomplete-upload");
    unblockItemFiles(target);
    assert.equal((await send("DELETE", id)).status, 202);
    assert.equal((await settledRestore(target, ["cancelled", "failed"])).state, "cancelled");
  });
});
