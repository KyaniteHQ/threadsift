import assert from "node:assert/strict";
import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TestContext } from "node:test";

import { z } from "zod";

import {
  RestoreStatusSchema,
  type RestoreStatus,
  StartedRestoreSchema,
  entering,
} from "../src/core/contract/restore-contract.ts";
import { exportedZip } from "./export-restore-fixtures.ts";
import type { Answer, Instance } from "./instance.ts";
import { loggedAttempts, untilRetried } from "./job-fixtures.ts";
import { until } from "./library-fixtures.ts";

const ProgressSchema = z.object({
  state: z.string(),
  phase: z.string(),
  cursor: z.string(),
  restored: z.string(),
  dropped: z.string(),
  finished_at: z.number().nullable(),
});

export function restoreProgress(instance: Instance, id: number) {
  const [row] = instance.database.rows(
    ProgressSchema,
    "select state, phase, cursor, restored, dropped, finished_at from restores where id = ?",
    id,
  );

  assert.ok(row !== undefined, "the Restore row exists");

  return row;
}

export function movedToPhase(instance: Instance, id: number, phase: "tables" | "finish"): void {
  instance.database.exec(
    "update restores set phase = ?, cursor = ? where id = ?",
    phase,
    entering(phase).cursor,
    id,
  );
}

export function putPart(instance: Instance, id: number, bytes: Uint8Array): Promise<Response> {
  return instance.request(`/api/restore/${String(id)}/parts/1`, {
    method: "PUT",
    headers: { "content-type": "application/octet-stream" },
    body: bytes.slice(),
  });
}

export async function uploadedRestore(instance: Instance, bytes: Uint8Array): Promise<number> {
  const { id } = await instance.read("POST", "/api/restore", StartedRestoreSchema, {
    bytes: bytes.length,
    parts: 1,
  });

  assert.equal((await putPart(instance, id, bytes)).status, 204);

  return id;
}

export async function startedRestore(instance: Instance, bytes: Uint8Array): Promise<number> {
  const id = await uploadedRestore(instance, bytes);

  assert.equal((await instance.send("POST", `/api/restore/${String(id)}/start`)).status, 202);

  return id;
}

export function restoreStatus(instance: Instance): Promise<RestoreStatus> {
  return instance.read("GET", "/api/restore", RestoreStatusSchema);
}

type Settled = Exclude<RestoreStatus["state"], "uploading" | "running" | "cancelling">;

type SettledStatus<State extends Settled> = Extract<RestoreStatus, { state: State }>;

const isSettled =
  <State extends Settled>(states: readonly State[]) =>
  (status: RestoreStatus): status is SettledStatus<State> =>
    states.some((settled) => settled === status.state);

export function settledRestore<State extends Settled>(
  instance: Instance,
  states: readonly State[],
) {
  return until(
    `the Restore is ${states.join(" or ")}`,
    () => restoreStatus(instance),
    isSettled(states),
  );
}

export const failedAfterRetries = (instance: Instance) =>
  untilRetried(
    instance,
    "restore",
    "the Restore is failed",
    () => restoreStatus(instance),
    isSettled(["failed"]),
  );

export async function restoredDone(instance: Instance) {
  const status = await settledRestore(instance, ["done", "failed"]);

  assert.ok(status.state === "done", JSON.stringify(status));

  return status;
}

function itemFilesPath(instance: Instance): string {
  return join(dirname(instance.databaseFile), "data", "files", "items");
}

const heldItemFilesPath = (instance: Instance): string => `${itemFilesPath(instance)}.held`;

function blockItemFiles(instance: Instance): void {
  const path = itemFilesPath(instance);

  mkdirSync(dirname(path), { recursive: true });

  if (statSync(path, { throwIfNoEntry: false })?.isDirectory() === true) {
    renameSync(path, heldItemFilesPath(instance));
  }

  writeFileSync(path, "");
}

export function unblockItemFiles(instance: Instance): void {
  const path = itemFilesPath(instance);

  if (statSync(path, { throwIfNoEntry: false })?.isFile() === true) rmSync(path);

  if (existsSync(heldItemFilesPath(instance))) {
    renameSync(heldItemFilesPath(instance), itemFilesPath(instance));
  }
}

export async function gaveUpInFiles(t: TestContext, instance: Instance, bytes: Uint8Array) {
  const attempts = loggedAttempts(t, "restore");
  const id = await uploadedRestore(instance, bytes);

  blockItemFiles(instance);
  assert.equal((await instance.send("POST", `/api/restore/${String(id)}/start`)).status, 202);

  const failed = await failedAfterRetries(instance);

  assert.deepEqual([failed.failure, failed.resumable], ["gave-up", true], JSON.stringify(failed));
  assert.deepEqual(attempts(), [1, 2, 3]);

  return id;
}

export function holdLibrary(
  instance: Instance,
  state: "running" | "failed",
  failure: "gave-up" | "no-manifest" | "other-release" | null,
  phase: "check" | "tables" = "tables",
  restored = "{}",
): void {
  instance.database.exec(
    "insert into restores (id, state, phase, failure, restored, bytes, parts, part_bytes, created_at, updated_at) values (1, ?, ?, ?, ?, 1, 1, 1, 1, 1) on conflict (id) do update set state = excluded.state, phase = excluded.phase, failure = excluded.failure, restored = excluded.restored",
    state,
    phase,
    failure,
    restored,
  );
}

export function releaseLibrary(instance: Instance): void {
  instance.database.exec("delete from restores where id = 1");
}

export async function whileHeld<Seen>(
  instance: Instance,
  run: () => Promise<Seen>,
  failure: "gave-up" | null = null,
): Promise<Seen> {
  assert.equal(
    instance.database.rowCount("restores"),
    0,
    "whileHeld stages Restore 1 on an Instance that holds no Restore",
  );
  holdLibrary(instance, failure === null ? "running" : "failed", failure);

  try {
    return await run();
  } finally {
    releaseLibrary(instance);
  }
}

const RefusalBodySchema = z.object({ error: z.string(), code: z.string() });

export function refusal(answer: Answer) {
  return { status: answer.status, body: RefusalBodySchema.parse(JSON.parse(answer.body)) };
}

export async function restoreLibrary({
  from,
  into,
}: Readonly<{ from: Instance; into: Instance }>): Promise<void> {
  await startedRestore(into, await exportedZip(from));
  await restoredDone(into);
}
