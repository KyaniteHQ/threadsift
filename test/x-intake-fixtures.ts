import assert from "node:assert/strict";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import type { ClaimedJob } from "../src/core/kernel/job-outcome.ts";
import { jobs } from "../src/core/kernel/schema.ts";
import { botStep } from "../src/features/ai/core/bot-step.ts";
import { xIntakeKind } from "../src/features/x/core/x-intake.ts";
import { acceptedByBot, claimedNew } from "./bot-task-fixtures.ts";
import type { Credential } from "./bot-task-http.ts";
import { taskRows } from "./bot-task-rows.ts";
import type { Instance, Json } from "./instance.ts";
import { exec, rows } from "./related-fixtures.ts";

export interface IntakeTask {
  readonly itemId: number;
  readonly job: ClaimedJob;
  readonly id: number;
  readonly token: string;
  readonly statusId: string;
}

let nextStatus = 2_000_000_000_000_000_000n;

export const addressOf = (statusId: string) => `https://x.com/someone/status/${statusId}`;

export function claimedFetchJob(
  instance: Instance,
  itemId: number,
  address: string,
): Promise<ClaimedJob> {
  return claimedNew(instance, { kind: "fetch", itemId, address });
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

export async function latestFetchJob(instance: Instance, itemId: number) {
  const [job] = await instance.core.db
    .select()
    .from(jobs)
    .where(and(eq(jobs.itemId, itemId), eq(jobs.kind, "fetch")))
    .orderBy(desc(jobs.id))
    .limit(1);

  if (job === undefined) throw new Error("the job was not stored");

  return job;
}

export async function sentIntake(instance: Instance): Promise<IntakeTask> {
  nextStatus += 1n;

  const statusId = String(nextStatus);
  const itemId = insertedXItem(instance, statusId);
  const job = await claimedFetchJob(instance, itemId, addressOf(statusId));
  await assert.rejects(stepOf(instance, job), /Grok Bot send failed/u);
  const [task] = taskRows(instance, "job_id = ?", job.id);
  assert.ok(task !== undefined);
  return { itemId, job, ...acceptedByBot(instance, task.id), statusId };
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

export async function waitingIntake(instance: Instance): Promise<IntakeTask> {
  const task = await sentIntake(instance);

  exec(
    instance,
    "update jobs set state = 'queued', next_attempt_at = ?, claim_expires = null, wait_reason = 'grok-bot' where id = ?",
    rows(
      instance,
      z.object({ deadline: z.number() }),
      "select deadline from ai_tasks where id = ?",
      task.id,
    )[0]?.deadline ?? 0,
    task.job.id,
  );

  return task;
}
