import assert from "node:assert/strict";
import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TestContext } from "node:test";

import { z } from "zod";

import type { UnownedJobKind } from "../src/core/contract/job-contract.ts";
import {
  RestoreStatusSchema,
  type RestoreStatus,
  StartedRestoreSchema,
  entering,
} from "../src/core/contract/restore-contract.ts";
import { exportedZip } from "./export-restore-fixtures.ts";
import type { Instance } from "./instance.ts";
import { until, exec, rows } from "./related-fixtures.ts";

const AttemptLineSchema = z.object({
  event: z.literal("job-attempt-failed"),
  kind: z.string(),
  attempt: z.number(),
});

const ProgressSchema = z.object({
  state: z.string(),
  phase: z.string(),
  cursor: z.string(),
  restored: z.string(),
  dropped: z.string(),
  finished_at: z.number().nullable(),
});

export function restoreProgress(instance: Instance, id: number) {
  const [row] = rows(
    instance,
    ProgressSchema,
    "select state, phase, cursor, restored, dropped, finished_at from restores where id = ?",
    id,
  );

  assert.ok(row !== undefined, "the Restore row exists");

  return row;
}

export function movedToPhase(instance: Instance, id: number, phase: "tables" | "finish"): void {
  exec(
    instance,
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

export async function restoredDone(instance: Instance) {
  const status = await settledRestore(instance, ["done", "failed"]);

  assert.ok(status.state === "done", JSON.stringify(status));

  return status;
}

export function retryNow(instance: Instance, kind: UnownedJobKind): void {
  exec(instance, "update jobs set next_attempt_at = 0 where state = 'queued' and kind = ?", kind);
  instance.core.jobs.wake();
}

export function settledAfterRetries<State extends Settled>(
  instance: Instance,
  states: readonly State[],
) {
  return until(
    `the Restore is ${states.join(" or ")} after retries`,
    () => {
      retryNow(instance, "restore");

      return restoreStatus(instance);
    },
    isSettled(states),
  );
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

export function loggedAttempts(t: TestContext, kind: string): () => readonly number[] {
  const logged = t.mock.method(console, "error", () => {});

  return () =>
    logged.mock.calls.flatMap(({ arguments: args }) => {
      const line = AttemptLineSchema.safeParse(JSON.parse(String(args[0])));

      return line.success && line.data.kind === kind ? [line.data.attempt] : [];
    });
}

export async function gaveUpInFiles(t: TestContext, instance: Instance, bytes: Uint8Array) {
  const attempts = loggedAttempts(t, "restore");
  const id = await uploadedRestore(instance, bytes);

  blockItemFiles(instance);
  assert.equal((await instance.send("POST", `/api/restore/${String(id)}/start`)).status, 202);

  const failed = await settledAfterRetries(instance, ["failed"]);

  assert.deepEqual([failed.failure, failed.resumable], ["gave-up", true], JSON.stringify(failed));
  assert.deepEqual(attempts(), [1, 2, 3]);

  return id;
}

export function holdLibrary(
  instance: Instance,
  state: "running" | "failed",
  failure: "gave-up" | "no-manifest" | null,
  phase: "check" | "tables" = "tables",
): void {
  exec(
    instance,
    "insert into restores (id, state, phase, failure, bytes, parts, part_bytes, created_at, updated_at) values (1, ?, ?, ?, 1, 1, 1, 1, 1) on conflict (id) do update set state = excluded.state, phase = excluded.phase, failure = excluded.failure",
    state,
    phase,
    failure,
  );
}

export function releaseLibrary(instance: Instance): void {
  exec(instance, "delete from restores where id = 1");
}

export async function restoreLibrary({
  from,
  into,
}: Readonly<{ from: Instance; into: Instance }>): Promise<void> {
  await startedRestore(into, await exportedZip(from));
  await restoredDone(into);
}
