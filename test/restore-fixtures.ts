import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TestContext } from "node:test";

import { z } from "zod";

import {
  RestoreStatusSchema,
  type RestoreStatus,
  StartedRestoreSchema,
} from "../src/core/contract/restore-contract.ts";
import type { Instance } from "./instance.ts";
import { until } from "./related-fixtures.ts";
import { exec } from "./sqlite-fixtures.ts";

const ORIGIN = "http://localhost";

const AttemptLineSchema = z.object({
  event: z.literal("job-attempt-failed"),
  kind: z.string(),
  attempt: z.number(),
});

export function putPart(instance: Instance, id: number, bytes: Uint8Array): Promise<Response> {
  return instance.fetch(`/api/restore/${String(id)}/parts/1`, {
    method: "PUT",
    headers: {
      "content-type": "application/octet-stream",
      cookie: instance.sessionCookie ?? "",
      origin: ORIGIN,
    },
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

export function settledRestore(instance: Instance, states: readonly Settled[]) {
  return until(
    () => restoreStatus(instance),
    ({ state }) => states.some((settled) => settled === state),
  );
}

export function retryNow(instance: Instance): void {
  exec(instance, "update jobs set next_attempt_at = 0 where state = 'queued'");
  instance.core.jobs.wake();
}

export function settledAfterRetries(instance: Instance, states: readonly Settled[]) {
  return until(
    () => {
      retryNow(instance);

      return restoreStatus(instance);
    },
    ({ state }) => states.some((settled) => settled === state),
  );
}

function itemFilesPath(instance: Instance): string {
  return join(dirname(instance.databaseFile), "data", "files", "items");
}

export function blockItemFiles(instance: Instance): void {
  mkdirSync(dirname(itemFilesPath(instance)), { recursive: true });
  writeFileSync(itemFilesPath(instance), "");
}

export function unblockItemFiles(instance: Instance): void {
  rmSync(itemFilesPath(instance), { force: true });
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

  assert.deepEqual(
    failed.state === "failed" ? [failed.failure, failed.resumable] : null,
    ["gave-up", true],
    JSON.stringify(failed),
  );
  assert.deepEqual(attempts(), [1, 2, 3]);

  return id;
}
