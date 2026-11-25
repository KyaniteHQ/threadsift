import assert from "node:assert/strict";
import { type TestContext, after, afterEach, before, beforeEach, describe, it } from "node:test";

import { RestoreErrorSchema, restoreAnswerSchema } from "../src/core/contract/restore-contract.ts";
import { DAY_MS } from "../src/core/contract/time-units.ts";
import { listedKeys } from "../src/core/kernel/file-pages.ts";
import { exportedZip, firstLongText, savedLibrary } from "./export-restore-fixtures.ts";
import { Instance } from "./instance.ts";
import { paste } from "./library-fixtures.ts";
import {
  gaveUpInFiles,
  movedToPhase,
  restoreProgress,
  restoreStatus,
  restoredDone,
  failedAfterRetries,
  settledRestore,
  startedRestore,
  unblockItemFiles,
  uploadedRestore,
} from "./restore-fixtures.ts";
import { nextSweepAt } from "./weekly-claim-fixtures.ts";

const NOT_A_ZIP = new TextEncoder().encode("this is not a zip");

const AnswerSchema = restoreAnswerSchema("superseded", "not-resumable");

describe("the owner cancels, resumes and undoes a Restore", () => {
  let source: Instance;
  let zip: Uint8Array;
  let long: ReturnType<typeof firstLongText>;
  let target: Instance;

  before(async () => {
    source = await Instance.start();
    await source.setUp();

    long = firstLongText(await savedLibrary(source, { inlineText: 1, fileText: 1 }));
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

    assert.deepEqual(await listedKeys(target.core.files, `restores/${String(id)}/`), [
      `restores/${String(id)}/part-1`,
    ]);
    assert.equal((await send("DELETE", id)).status, 204);
    assert.equal((await restoreStatus(target)).state, "cancelled");
    assert.deepEqual(await listedKeys(target.core.files, `restores/${String(id)}/`), []);
    assert.equal((await send("DELETE", id)).status, 204);
    assert.equal((await target.send("POST", "/api/restore", { bytes: 1, parts: 1 })).status, 201);
  });

  it("cancels a Restore that the check refused with 204 and shows it cancelled", async () => {
    const refused = await startedRestore(target, NOT_A_ZIP);

    await settledRestore(target, ["failed"]);
    assert.equal((await send("DELETE", refused)).status, 204);
    assert.deepEqual(await restoreStatus(target), {
      state: "cancelled",
      libraryEmpty: true,
      id: refused,
    });
  });

  it("leaves an Item saved after the check refused the Restore when the owner cancels it", async () => {
    const refused = await startedRestore(target, NOT_A_ZIP);

    await settledRestore(target, ["failed"]);

    const saved = await paste(target, "after-refusal", { title: "Saved after the refusal" });

    assert.equal((await send("DELETE", refused)).status, 204);
    assert.equal((await target.detail(saved)).id, saved);
    assert.equal(target.database.rowCount("items"), 1);
  });

  it("answers 409 superseded to a Cancel and a Resume of an older Restore, and leaves the newer upload open", async () => {
    const older = await startedRestore(target, NOT_A_ZIP);

    await settledRestore(target, ["failed"]);

    const newer = await uploadedRestore(target, zip);
    const cancel = await send("DELETE", older);
    const resume = await send("POST", older, "/resume");

    assert.deepEqual([cancel.status, resume.status], [409, 409]);
    assert.deepEqual(
      [cancel.body, resume.body].map((body) => AnswerSchema.parse(JSON.parse(body)).code),
      ["superseded", "superseded"],
    );

    const status = await restoreStatus(target);

    assert.ok(status.state === "uploading", JSON.stringify(status));
    assert.equal(status.id, newer);
  });

  it("gives up a unit after 3 failed attempts and keeps the rows it wrote", async (t) => {
    await gaveUpInFiles(t, target, zip);

    const held = await settledRestore(target, ["failed"]);

    assert.equal(held.libraryEmpty, false);
    assert.equal(target.database.rowCount("items"), 2);
  });

  it("keeps the parts of a Restore that gave up", async (t) => {
    const id = await gaveUpInFiles(t, target, zip);

    assert.deepEqual(await listedKeys(target.core.files, `restores/${String(id)}/`), [
      `restores/${String(id)}/part-1`,
    ]);
  });

  it("resumes from the cursor of the last unit, so no table is written twice", async (t) => {
    const id = await gaveUpInFiles(t, target, zip);

    unblockItemFiles(target);
    assert.equal((await send("POST", id, "/resume")).status, 202);

    const done = await restoredDone(target);

    assert.equal(done.restored["items"], 2);
    assert.ok(Object.values(done.dropped).every((dropped) => dropped === 0));
    assert.equal(done.files, 1);
    assert.equal((await target.detail(long.id)).postText, long.text);
  });

  it("opens the library to a Paste once a resumed Restore is done", async (t) => {
    const id = await gaveUpInFiles(t, target, zip);

    unblockItemFiles(target);
    assert.equal((await send("POST", id, "/resume")).status, 202);
    await restoredDone(target);
    assert.equal(
      (await target.send("POST", "/api/items", { url: "https://x.com/someone/status/3500000001" }))
        .status,
      201,
    );
  });

  it("checks the release again before a unit, so a newer migration ends a resumed Restore with other-release before it writes a file", async (t) => {
    const id = await gaveUpInFiles(t, target, zip);

    unblockItemFiles(target);
    target.database.exec("insert into d1_migrations (name) values ('9999_newer.sql')");
    assert.equal((await send("POST", id, "/resume")).status, 202);

    const failed = await settledRestore(target, ["failed"]);

    assert.equal(failed.failure, "other-release");
    assert.deepEqual(await listedKeys(target.core.files, "items/"), []);
    assert.equal(target.database.rowCount("items"), 2);
  });

  const refusedInPhase = async (t: TestContext, phase: "tables" | "finish") => {
    const id = await gaveUpInFiles(t, target, zip);

    unblockItemFiles(target);
    movedToPhase(target, id, phase);
    target.database.exec("insert into d1_migrations (name) values ('9999_newer.sql')");

    const held = restoreProgress(target, id);

    assert.equal((await send("POST", id, "/resume")).status, 202);

    const failed = await settledRestore(target, ["failed"]);

    assert.equal(failed.failure, "other-release");
    assert.deepEqual(restoreProgress(target, id), { ...held, state: "failed" });
    assert.deepEqual(await listedKeys(target.core.files, "items/"), []);
    assert.equal(target.database.rowCount("items"), 2);
  };

  it("checks the release again in the tables phase, so a newer migration ends a resumed Restore with other-release and writes nothing further", (t) =>
    refusedInPhase(t, "tables"));

  it("checks the release again in the finish phase, so a newer migration ends a resumed Restore with other-release and writes nothing further", (t) =>
    refusedInPhase(t, "finish"));

  const undone = async (t: TestContext) => {
    const id = await gaveUpInFiles(t, target, zip);

    unblockItemFiles(target);
    await target.core.files.put(
      "items/1/post-9-9.md",
      new TextEncoder().encode("an object that a unit put while the cancel started"),
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
      assert.equal(target.database.rowCount(table), 0, table);
    }

    assert.equal(target.database.rowCount("log_start"), 1);
    assert.equal(target.database.rowCount("catalog_version"), 1);
  });

  it("undoes a Restore that gave up by deleting every file under items/ and its parts", async (t) => {
    const id = await undone(t);

    assert.deepEqual(await listedKeys(target.core.files, "items/"), []);
    assert.deepEqual(await listedKeys(target.core.files, `restores/${String(id)}/`), []);
  });

  it("frees the library for a new upload once an undo is done", async (t) => {
    await undone(t);
    assert.equal((await target.send("POST", "/api/restore", { bytes: 1, parts: 1 })).status, 201);
  });

  it("shows cancelFailed when an undo gives up, refuses to resume it, and finishes at the next Cancel", async (t) => {
    const id = await gaveUpInFiles(t, target, zip);
    const cancel = await send("DELETE", id);

    assert.equal(cancel.status, 202);

    const failed = await failedAfterRetries(target);

    assert.deepEqual(
      [failed.failure, failed.cancelFailed, failed.resumable],
      ["gave-up", true, false],
    );

    const resume = await send("POST", id, "/resume");

    assert.equal(resume.status, 409);
    assert.equal(AnswerSchema.parse(JSON.parse(resume.body)).code, "not-resumable");

    unblockItemFiles(target);
    assert.equal((await send("DELETE", id)).status, 202);
    assert.equal((await settledRestore(target, ["cancelled", "failed"])).state, "cancelled");
    assert.equal(target.database.rowCount("items"), 0);
  });

  it("deletes the parts of a Restore that gave up 24 hours after its last update, and then refuses to resume it", async (t) => {
    const id = await gaveUpInFiles(t, target, zip);

    const keys = `restores/${String(id)}/`;
    const now = Date.now();

    const sweptAt = async (updatedAt: number) => {
      target.database.exec("update restores set updated_at = ? where id = ?", updatedAt, id);
      await nextSweepAt(target, now);

      return listedKeys(target.core.files, keys);
    };

    assert.deepEqual(await sweptAt(now - DAY_MS), [`${keys}part-1`]);
    assert.deepEqual(await sweptAt(now - DAY_MS - 1), []);

    assert.equal((await settledRestore(target, ["failed"])).resumable, false);

    const resume = await send("POST", id, "/resume");

    assert.equal(resume.status, 400);
    assert.equal(RestoreErrorSchema.parse(JSON.parse(resume.body)).code, "incomplete-upload");
    unblockItemFiles(target);
    assert.equal((await send("DELETE", id)).status, 202);
    assert.equal((await settledRestore(target, ["cancelled", "failed"])).state, "cancelled");
  });
});
