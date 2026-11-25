import type { TestContext } from "node:test";

import { z } from "zod";

import type { UnownedJobKind } from "../src/core/contract/job-contract.ts";
import type { Instance } from "./instance.ts";
import { until } from "./library-fixtures.ts";

const AttemptLineSchema = z.object({
  event: z.literal("job-attempt-failed"),
  kind: z.string(),
  attempt: z.number(),
});

const JobRowSchema = z.object({
  state: z.string(),
  attempts: z.number(),
  next_attempt_at: z.number(),
  wait_reason: z.string().nullable(),
  stale_requeues: z.number(),
});

export function jobRow(instance: Instance, id: number) {
  const [row] = instance.database.rows(
    JobRowSchema,
    "select state, attempts, next_attempt_at, wait_reason, stale_requeues from jobs where id = ?",
    id,
  );

  if (row === undefined) throw new Error(`no job ${String(id)}`);

  return row;
}

export function dueNow(instance: Instance, id: number): void {
  instance.database.exec("update jobs set next_attempt_at = 0 where id = ?", id);
}

export function requeued(instance: Instance, id: number, attempts?: number): void {
  instance.database.exec(
    "update jobs set state = 'queued', attempts = coalesce(?, attempts), next_attempt_at = 0, claim_expires = null where id = ?",
    attempts ?? null,
    id,
  );
}

export const jobAfterAttempts = (instance: Instance, id: number, attempts: number) =>
  until(
    `job ${String(id)} has spent ${String(attempts)} attempts`,
    () => jobRow(instance, id),
    (row) => row.attempts === attempts,
  );

function retryNow(instance: Instance, kind: UnownedJobKind): void {
  instance.database.exec(
    "update jobs set next_attempt_at = 0 where state = 'queued' and kind = ?",
    kind,
  );
  instance.core.jobs.wake();
}

export function untilRetried<Value, Done extends Value>(
  instance: Instance,
  kind: UnownedJobKind,
  what: string,
  read: () => Promise<Value>,
  isDone: (value: Value) => value is Done,
): Promise<Done>;
export function untilRetried<Value>(
  instance: Instance,
  kind: UnownedJobKind,
  what: string,
  read: () => Promise<Value>,
  isDone: (value: Value) => boolean,
): Promise<Value>;
export function untilRetried<Value>(
  instance: Instance,
  kind: UnownedJobKind,
  what: string,
  read: () => Promise<Value>,
  isDone: (value: Value) => boolean,
): Promise<Value> {
  return until(
    `${what} after retries`,
    () => {
      retryNow(instance, kind);

      return read();
    },
    isDone,
  );
}

export function loggedAttempts(t: TestContext, kind: string): () => readonly number[] {
  const logged = t.mock.method(console, "error", () => {});

  return () =>
    logged.mock.calls.flatMap(({ arguments: args }) => {
      const line = AttemptLineSchema.safeParse(JSON.parse(String(args[0])));

      return line.success && line.data.kind === kind ? [line.data.attempt] : [];
    });
}
