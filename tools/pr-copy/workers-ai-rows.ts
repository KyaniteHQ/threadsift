import { z } from "zod";

import { queryRun } from "./check-measure.ts";
import type { Run } from "./check-run.ts";

export const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const MISSING_MODEL = "@cf/threadsift/nonexistent-proof-model";

export const REFUSALS = [
  "model-not-found",
  "no-json",
  "unreachable",
  "timeout",
  "refused",
  "provider-busy",
];

const COUNT_LIMIT = 99;
const TASK_COLUMNS = "executor, provider, model, state, refusal, attempts";

export const Count = z.object({ n: z.number().int() });

export const TaskRow = z.object({
  executor: z.string(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  state: z.string(),
  refusal: z.string().nullable(),
  attempts: z.number().int(),
});

export const DigestRow = z.object({
  provider: z.string().nullable(),
  model: z.string().nullable(),
});

export const JobRow = z.object({ state: z.string(), attempts: z.number().int() });

export type Task = z.infer<typeof TaskRow>;

export function oneOf(allowed: readonly string[], value: string | null): string {
  if (value === null) return "none";

  return allowed.includes(value) ? value : "other";
}

export function counted(rows: readonly unknown[]): number {
  return Math.min(rows.length, COUNT_LIMIT);
}

function modelLabel(model: string | null): string {
  if (model === MODEL) return "proof";

  if (model === MISSING_MODEL) return "missing";

  return model === null ? "none" : "other";
}

export function describeTask(task: Readonly<Task> | undefined): string {
  if (task === undefined) return "no row";

  return [
    `executor ${oneOf(["binding", "http", "caller"], task.executor)}`,
    `provider ${oneOf(["workers-ai"], task.provider)}`,
    `model ${modelLabel(task.model)}`,
    `state ${oneOf(["done", "failed"], task.state)}`,
    `refusal ${oneOf(REFUSALS, task.refusal)}`,
    `attempts ${String(Math.min(Math.max(task.attempts, 0), COUNT_LIMIT))}`,
  ].join(", ");
}

export function boundTo(task: Readonly<Task> | undefined, model: string): boolean {
  return task?.executor === "binding" && task.provider === "workers-ai" && task.model === model;
}

export async function firstRow<Row>(
  run: Readonly<Run>,
  sql: string,
  row: z.ZodType<Row>,
  deadline: number,
): Promise<Row | undefined> {
  const [first] = await queryRun(run, sql, row, deadline);

  return first;
}

export const taskSql = (id: number) =>
  `SELECT ${TASK_COLUMNS} FROM ai_tasks WHERE id = ${String(id)}`;

export const digestTaskSql = (itemId: number) =>
  `SELECT t.executor, t.provider, t.model, t.state, t.refusal, t.attempts FROM digests d JOIN ai_tasks t ON t.id = d.task_id WHERE d.item_id = ${String(itemId)}`;

export const digestRowSql = (itemId: number) =>
  `SELECT provider, model FROM digests WHERE item_id = ${String(itemId)}`;

export async function lastTaskId(run: Readonly<Run>, deadline: number): Promise<number> {
  const last = await firstRow(
    run,
    "SELECT coalesce(max(id), 0) AS n FROM ai_tasks",
    Count,
    deadline,
  );

  return last?.n ?? 0;
}

export const digestJobsSql = (itemId: number) =>
  `SELECT state, attempts FROM jobs WHERE item_id = ${String(itemId)} AND kind = 'digest'`;

export const tasksAfterSql = (baseline: number) =>
  `SELECT ${TASK_COLUMNS} FROM ai_tasks WHERE id > ${String(baseline)} ORDER BY id`;
