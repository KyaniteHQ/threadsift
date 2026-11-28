import assert from "node:assert/strict";
import type { TestContext } from "node:test";

import { z } from "zod";

import { RESTORE_SETTLE_MS } from "../src/core/contract/restore-contract.ts";
import { exportWithPostText, exportedZip, savedLibrary } from "./export-restore-fixtures.ts";
import { Instance } from "./instance.ts";
import { loggedAttempts, untilRetried } from "./job-fixtures.ts";
import { until } from "./library-fixtures.ts";
import { restoreStatus, settledRestore, uploadedRestore } from "./restore-fixtures.ts";
import { nextSweep } from "./weekly-claim-fixtures.ts";
import { entriesOf, rootOf, withoutEntry, zipOf } from "./zip-fixtures.ts";

const PhaseSchema = z.object({ phase: z.string() });

const CountSchema = z.object({ count: z.number() });

export const CHANGED_TEXT = "x".repeat(5000);

const ITEM_KEYS_PAGE = 100;

export const itemKeys = async (instance: Instance, itemId: number) =>
  (await instance.core.files.list(`items/${String(itemId)}/`, null, ITEM_KEYS_PAGE)).keys;

const postTextKey = async (instance: Instance, itemId: number) =>
  (await itemKeys(instance, itemId)).find((name) => name.includes("/post-")) ?? "";

export async function lateWriteZips() {
  const source = await Instance.start();

  await source.setUp();

  const [[itemId] = [0], [otherItemId] = [0]] = (
    await savedLibrary(source, { inlineText: 1, fileText: 2 })
  ).longTexts;
  const key = await postTextKey(source, itemId);
  const otherKey = await postTextKey(source, otherItemId);
  const first = await exportedZip(source);
  const { zip: second } = await exportWithPostText(source, key, CHANGED_TEXT.length);

  await source.close();

  const entries = await entriesOf(first);
  const withoutKey = zipOf(withoutEntry(entries, `${rootOf(entries)}${key}`));

  return { itemId, otherItemId, key, otherKey, first, second, withoutKey };
}

export const inFiles = (instance: Instance, id: number) =>
  instance.database.rows(PhaseSchema, "select phase from restores where id = ?", id)[0]?.phase ===
  "files";

export function heldWrite(t: TestContext, instance: Instance, holds: (key: string) => boolean) {
  const { files } = instance.core;
  const stored = files.put.bind(files);
  const reached = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const landed = Promise.withResolvers<void>();
  const started: string[] = [];
  let held = false;

  t.mock.method(files, "put", async (key: string, bytes: Uint8Array) => {
    started.push(key);

    if (held || !holds(key)) return stored(key, bytes);

    held = true;
    reached.resolve();
    await release.promise;
    await stored(key, bytes);
    landed.resolve();
  });

  return {
    reached: reached.promise,
    landed: landed.promise,
    started,
    release: () => {
      release.resolve();
    },
  };
}

export async function cancelledWhileHeld(
  instance: Instance,
  bytes: Uint8Array,
  reached: Promise<void>,
): Promise<void> {
  const id = await uploadedRestore(instance, bytes);

  assert.equal((await instance.send("POST", `/api/restore/${String(id)}/start`)).status, 202);
  await reached;
  assert.equal((await instance.send("DELETE", `/api/restore/${String(id)}`)).status, 202);
  assert.equal((await settledRestore(instance, ["cancelled", "failed"])).state, "cancelled");
}

const waitingRestores = (instance: Instance) =>
  instance.database.rows(
    CountSchema,
    "select count(*) as count from jobs where kind = 'restore' and state = 'queued' and next_attempt_at > ?",
    Date.now(),
  )[0]?.count ?? 0;

export async function startedToFiles(instance: Instance, bytes: Uint8Array): Promise<void> {
  const id = await uploadedRestore(instance, bytes);

  assert.equal((await instance.send("POST", `/api/restore/${String(id)}/start`)).status, 202);
  await until(
    "the Restore is done or waits before its files",
    () => restoreStatus(instance),
    (status) => status.state === "done" || waitingRestores(instance) > 0,
  );
}

export function settledOlderRestores(instance: Instance): void {
  instance.database.exec(
    "update restores set updated_at = updated_at - ? where state = 'cancelled'",
    RESTORE_SETTLE_MS,
  );
}

export const restoreAttemptFailures = (t: TestContext) => loggedAttempts(t, "restore");

export const doneAfterRetries = (instance: Instance) =>
  untilRetried(
    instance,
    "restore",
    "the Restore is done",
    () => restoreStatus(instance),
    (status) => status.state === "done",
  );

export async function keysAfterSweep(instance: Instance, itemId: number) {
  await nextSweep(instance);

  return itemKeys(instance, itemId);
}
