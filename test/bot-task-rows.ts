import { createHash } from "node:crypto";

import { z } from "zod";

import type { Instance } from "./instance.ts";
import { exec, rows } from "./related-fixtures.ts";

const TaskRowSchema = z.object({
  id: z.number(),
  state: z.string(),
  refusal: z.string().nullable(),
  status: z.number().nullable(),
  result: z.string().nullable(),
  callback_hash: z.string().nullable(),
  job_id: z.number().nullable(),
  context: z.string().nullable(),
  sent_at: z.number().nullable(),
  answered_at: z.number().nullable(),
  deadline: z.number(),
  executor: z.string(),
  kind: z.string(),
});

export function taskRows(instance: Instance, where = "1 = 1", ...params: readonly number[]) {
  return rows(
    instance,
    TaskRowSchema,
    `select id, state, refusal, status, result, callback_hash, job_id, context, sent_at, answered_at, deadline, executor, kind from ai_tasks where ${where} order by id`,
    ...params,
  );
}

export function taskRow(instance: Instance, id: number) {
  const [row] = taskRows(instance, "id = ?", id);

  if (row === undefined) throw new Error(`no task ${String(id)}`);

  return row;
}

const JobRowSchema = z.object({
  state: z.string(),
  attempts: z.number(),
  next_attempt_at: z.number(),
  wait_reason: z.string().nullable(),
  stale_requeues: z.number(),
});

export function jobRow(instance: Instance, id: number) {
  const [row] = rows(
    instance,
    JobRowSchema,
    "select state, attempts, next_attempt_at, wait_reason, stale_requeues from jobs where id = ?",
    id,
  );

  if (row === undefined) throw new Error(`no job ${String(id)}`);

  return row;
}

export function insertedTask(
  instance: Instance,
  { kind, executor, token }: Readonly<{ kind: string; executor: string; token: string }>,
): number {
  exec(
    instance,
    "insert into ai_tasks (kind, inputs, input_revision, executor, attempts, deadline, state, callback_hash) values (?, '{}', 0, ?, 1, ?, 'running', ?)",
    kind,
    executor,
    Date.now() + 3_600_000,
    digestOfToken(token),
  );

  const [row] = rows(
    instance,
    z.object({ id: z.number() }),
    "select id from ai_tasks where callback_hash = ?",
    digestOfToken(token),
  );

  if (row === undefined) throw new Error("the task was not stored");

  return row.id;
}

export function digestOfToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
