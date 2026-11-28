import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";

import { RestoreErrorSchema } from "../src/core/contract/restore-contract.ts";
import { DAY_MS } from "../src/core/contract/time-units.ts";
import { listedKeys } from "../src/core/kernel/file-pages.ts";
import { exportedZip, savedLibrary } from "./export-restore-fixtures.ts";
import { Instance } from "./instance.ts";
import {
  gaveUpInFiles,
  restoreStatus,
  settledRestore,
  unblockItemFiles,
} from "./restore-fixtures.ts";
import { holdClaim, nextSweepAt } from "./weekly-claim-fixtures.ts";

const codeOf = (body: string) => RestoreErrorSchema.parse(JSON.parse(body)).code;

describe("a Restore that gave up keeps its parts for Resume for 24 hours, measured at the newest sweep claim", () => {
  let source: Instance;
  let zip: Uint8Array;
  let target: Instance;

  before(async () => {
    source = await Instance.start();
    await source.setUp();
    await savedLibrary(source, { inlineText: 1, fileText: 1 });
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

  const restoreJobs = () => target.database.rowCount("jobs");

  const cancelled = async (id: number) => {
    unblockItemFiles(target);
    assert.equal((await send("DELETE", id)).status, 202);
    assert.equal((await settledRestore(target, ["cancelled", "failed"])).state, "cancelled");
  };

  it("reads resumable false from the claim that passes the 24 hours on, while the parts are still stored", async (t) => {
    const id = await gaveUpInFiles(t, target, zip);
    const now = Date.now();
    const agedTo = async (updatedAt: number) => {
      target.database.exec("update restores set updated_at = ? where id = ?", updatedAt, id);

      return (await settledRestore(target, ["failed"])).resumable;
    };

    holdClaim(target, "sweep", now);

    assert.equal(await agedTo(now - DAY_MS), true);
    assert.equal(await agedTo(now - DAY_MS - 1), false);
    assert.deepEqual(await listedKeys(target.core.files, `restores/${String(id)}/`), [
      `restores/${String(id)}/part-1`,
    ]);
    await cancelled(id);
  });

  it("refuses with 400 incomplete-upload a Resume whose write comes after a sweep claimed past the 24 hours", async (t) => {
    const id = await gaveUpInFiles(t, target, zip);
    const now = Date.now();
    const { files } = target.core;
    const list = files.list.bind(files);

    holdClaim(target, "sweep", now);
    target.database.exec("update restores set updated_at = ? where id = ?", now - DAY_MS, id);

    const listing = t.mock.method(files, "list", (...args: Parameters<typeof list>) => {
      listing.mock.restore();
      holdClaim(target, "sweep", now + 1);

      return list(...args);
    });
    const jobs = restoreJobs();
    const resume = await send("POST", id, "/resume");

    assert.equal(listing.mock.callCount(), 1);
    assert.deepEqual([resume.status, codeOf(resume.body)], [400, "incomplete-upload"]);
    assert.equal((await restoreStatus(target)).state, "failed");
    assert.equal(restoreJobs(), jobs);
    await cancelled(id);
  });

  it("deletes the parts 24 hours after the last update, and refuses a Resume that comes between the sweep's read and its delete", async (t) => {
    const id = await gaveUpInFiles(t, target, zip);
    const keys = `restores/${String(id)}/`;
    const now = Date.now();
    const sweptAt = async (updatedAt: number) => {
      target.database.exec("update restores set updated_at = ? where id = ?", updatedAt, id);
      await nextSweepAt(target, now);

      return listedKeys(target.core.files, keys);
    };

    assert.deepEqual(await sweptAt(now - DAY_MS), [`${keys}part-1`]);

    const { files } = target.core;
    const deleteNow = files.delete.bind(files);
    const resumed = Promise.withResolvers<Awaited<ReturnType<typeof send>>>();
    const deleting = t.mock.method(files, "delete", async (doomed: readonly string[]) => {
      deleting.mock.restore();
      resumed.resolve(await send("POST", id, "/resume"));
      await deleteNow(doomed);
    });

    assert.deepEqual(await sweptAt(now - DAY_MS - 1), []);

    const resume = await resumed.promise;

    assert.deepEqual([resume.status, codeOf(resume.body)], [400, "incomplete-upload"]);
    assert.equal((await settledRestore(target, ["failed"])).resumable, false);
    await cancelled(id);
  });
});
