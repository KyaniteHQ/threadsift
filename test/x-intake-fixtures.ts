import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { botStep } from "../src/core/bot-step.ts";
import { ownerOf, startBotTask } from "../src/core/bot-task-start.ts";
import type { ClaimedJob } from "../src/core/job-outcome.ts";
import { jobs } from "../src/core/schema.ts";
import { xIntakeKind } from "../src/core/x-intake.ts";
import type { Credential } from "./bot-task-http.ts";
import type { Instance, Json } from "./instance.ts";
import { exec, rows } from "./related-fixtures.ts";

export interface IntakeTask {
  readonly itemId: number;
  readonly job: ClaimedJob;
  readonly id: number;
  readonly token: string;
  readonly statusId: string;
}

const HOUR_MS = 3_600_000;

let nextStatus = 2_000_000_000_000_000_000n;

export const addressOf = (statusId: string) => `https://x.com/someone/status/${statusId}`;

export function insertedFetchJob(instance: Instance, itemId: number, address: string): void {
  exec(
    instance,
    "insert into jobs (kind, item_id, address, state, attempts, stale_requeues, next_attempt_at, claim_expires) values ('fetch', ?, ?, 'running', 0, 0, 0, ?)",
    itemId,
    address,
    Date.now() + HOUR_MS,
  );
}

export function keptOffTheNetwork(instance: Instance, itemId: number, address: string): void {
  exec(
    instance,
    "insert into jobs (kind, item_id, address, state, attempts, stale_requeues, next_attempt_at, claim_expires) values ('x_verify', ?, ?, 'running', 0, 0, 0, ?)",
    itemId,
    address,
    Date.now() + HOUR_MS,
  );
}

export function insertedXItem(instance: Instance, statusId: string): number {
  exec(
    instance,
    "insert into items (source, kind, normalized_url, original_url, saved_at) values ('x', 'x-post', ?, ?, 1)",
    `https://x.com/i/status/${statusId}`,
    addressOf(statusId),
  );

  const [row] = rows(
    instance,
    z.object({ id: z.number() }),
    "select id from items where normalized_url = ?",
    `https://x.com/i/status/${statusId}`,
  );

  if (row === undefined) throw new Error("the Item was not stored");

  return row.id;
}

export async function openFetchJob(instance: Instance, itemId: number): Promise<ClaimedJob> {
  const [job] = await instance.core.db
    .select()
    .from(jobs)
    .where(and(eq(jobs.itemId, itemId), eq(jobs.kind, "fetch")))
    .orderBy(desc(jobs.id))
    .limit(1);

  if (job === undefined) throw new Error("the job was not stored");

  return Object.assign(job, { attemptKey: "", imagePrefix: "" });
}

export async function sentIntake(instance: Instance): Promise<IntakeTask> {
  nextStatus += 1n;

  const statusId = String(nextStatus);
  const itemId = insertedXItem(instance, statusId);

  insertedFetchJob(instance, itemId, addressOf(statusId));

  const job = await openFetchJob(instance, itemId);
  const prepared = await xIntakeKind.prepare(instance.core, job);

  if (prepared.kind !== "ask") throw new Error("the intake task has nothing to ask");

  const started = await startBotTask(instance.core, ownerOf(job), prepared.start);

  if (started.kind !== "started") throw new Error(`the task did not start: ${started.kind}`);

  exec(instance, "update ai_tasks set sent_at = ? where id = ?", Date.now(), started.task.id);

  return { itemId, job, id: started.task.id, token: started.token, statusId };
}

export function intakeTo(
  instance: Instance,
  { id, token }: Readonly<Credential>,
  body: Json,
): Promise<Response> {
  const headers = new Headers({ "content-type": "application/json" });

  if (token !== null) headers.set("authorization", `Bearer ${token}`);

  return instance.fetch(`/api/ai-tasks/${String(id)}/intake`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

export function advancedContent(instance: Instance, itemId: number): void {
  exec(instance, "update items set generation = generation + 1 where id = ?", itemId);
}

export function closedJob(instance: Instance, jobId: number): void {
  exec(instance, "update jobs set state = 'done', claim_expires = null where id = ?", jobId);
}

export function openJobIds(instance: Instance, itemId: number): readonly number[] {
  return rows(
    instance,
    z.object({ id: z.number() }),
    "select id from jobs where item_id = ? and state <> 'done'",
    itemId,
  ).map(({ id }) => id);
}

export function stepOf(instance: Instance, job: Readonly<ClaimedJob>) {
  return botStep(instance.core, job, xIntakeKind);
}

export async function sentIntakeForContent(instance: Instance): Promise<IntakeTask> {
  const task = await sentIntake(instance);

  keptOffTheNetwork(instance, task.itemId, addressOf(task.statusId));

  return task;
}
