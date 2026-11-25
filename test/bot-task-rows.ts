import { createHash } from "node:crypto";

import { z } from "zod";

import { HOUR_MS } from "../src/core/contract/time-units.ts";
import type { Instance } from "./instance.ts";

export { jobRow } from "./job-fixtures.ts";

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
  attempts: z.number(),
  executor: z.string(),
  kind: z.string(),
});

export function taskRows(instance: Instance, where = "1 = 1", ...params: readonly number[]) {
  return instance.database.rows(
    TaskRowSchema,
    `select id, state, refusal, status, result, callback_hash, job_id, context, sent_at, answered_at, deadline, attempts, executor, kind from ai_tasks where ${where} order by id`,
    ...params,
  );
}

export function taskRow(instance: Instance, id: number) {
  const [row] = taskRows(instance, "id = ?", id);

  if (row === undefined) throw new Error(`no task ${String(id)}`);

  return row;
}

export function reclaimed(instance: Instance, job: Readonly<{ id: number }>): void {
  instance.database.exec(
    "update jobs set state = 'running', claim_expires = ? where id = ?",
    Date.now() + HOUR_MS,
    job.id,
  );
}

export function insertedTask(
  instance: Instance,
  { kind, executor, token }: Readonly<{ kind: string; executor: string; token: string }>,
): number {
  instance.database.exec(
    "insert into ai_tasks (kind, inputs, input_revision, executor, attempts, deadline, state, callback_hash) values (?, '{}', 0, ?, 1, ?, 'running', ?)",
    kind,
    executor,
    Date.now() + HOUR_MS,
    digestOfToken(token),
  );

  const [row] = instance.database.rows(
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

export function topicFailures(instance: Instance) {
  return instance.database.rows(
    z.object({ topic_id: z.number(), failure: z.string().nullable() }),
    "select topic_id, failure from topic_pages order by topic_id",
  );
}

const LIBRARY_TABLES = [
  "digests",
  "topic_pages",
  "proposals",
  "topic_checks",
  "log_entries",
] as const;

export function libraryDump(instance: Instance, jobId: number): string {
  return JSON.stringify([
    ...LIBRARY_TABLES.map((table) =>
      instance.database.rows(z.looseObject({}), `select * from ${table} order by 1`),
    ),
    instance.database.rows(
      z.looseObject({}),
      "select * from ai_tasks where job_id = ? order by 1",
      jobId,
    ),
  ]);
}

const PageSchema = z.object({
  overview: z.string(),
  revision: z.number(),
  built_from: z.array(z.object({ item: z.number(), digest: z.number() })),
});

export function topicPage(instance: Instance, topicId: number) {
  const [page] = instance.database.rows(
    z.object({ overview: z.string(), revision: z.number(), built_from: z.string() }),
    "select overview, revision, built_from from topic_pages where topic_id = ?",
    topicId,
  );

  return page === undefined
    ? null
    : PageSchema.parse({ ...page, built_from: z.json().parse(JSON.parse(page.built_from)) });
}
