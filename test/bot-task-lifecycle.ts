import assert from "node:assert/strict";

import { applyOutcome } from "../src/core/compose/job-finish.ts";
import { HANDLERS } from "../src/core/compose/job-handlers.ts";
import type { JobOutcome } from "../src/core/kernel/job-outcome.ts";
import { holding } from "../src/core/kernel/job-rows.ts";
import { botStep } from "../src/features/ai/core/bot-step.ts";
import { sendBotTask } from "../src/features/ai/core/bot-task-send.ts";
import { ownerOf, startBotTask } from "../src/features/ai/core/bot-task-start.ts";
import { relatedKind } from "../src/features/related/core/related-kind.ts";
import { acceptedByBot, openJob, selectGrokBot } from "./bot-task-fixtures.ts";
import type { Instance } from "./instance.ts";
import { until } from "./related-fixtures.ts";
import { exec } from "./sqlite-fixtures.ts";

type ClaimedJob = Awaited<ReturnType<typeof openJob>>;

export async function startedTask(
  instance: Instance,
  job: Readonly<ClaimedJob>,
): Promise<{ readonly id: number; readonly token: string }> {
  await selectGrokBot(instance);

  const prepared = await until(
    () => relatedKind.prepare(instance.core, job),
    ({ kind }) => kind === "ask",
  );

  if (prepared.kind !== "ask") throw new Error("the Related pick has nothing to ask");

  const started = await startBotTask(instance.core, ownerOf(job), prepared.start);

  if (started.kind !== "started") throw new Error(`the task did not start: ${started.kind}`);

  return { id: started.task.id, token: started.token };
}

export async function taskAfterStart(instance: Instance, itemId: number) {
  const job = await openJob(instance, itemId);

  return { job, ...(await startedTask(instance, job)) };
}

export async function sentRelatedTask(instance: Instance, itemId: number) {
  const task = await taskAfterStart(instance, itemId);
  await assert.rejects(step(instance, task.job), /send failed: unreachable/u);
  return { job: task.job, ...acceptedByBot(instance, task.id) };
}

export function step(instance: Instance, job: Readonly<ClaimedJob>) {
  return botStep(instance.core, job, relatedKind);
}

export function applied(
  instance: Instance,
  job: Readonly<ClaimedJob>,
  outcome: JobOutcome,
): Promise<void> {
  return applyOutcome(instance.core, job, outcome, HANDLERS[job.kind]);
}

export async function settle(
  instance: Instance,
  job: Readonly<ClaimedJob>,
  holder: Readonly<ClaimedJob> = job,
): Promise<void> {
  await applied(instance, holder, await step(instance, job));
}

export function sendFor(
  instance: Instance,
  {
    job,
    task,
    token,
  }: Readonly<
    { job: Readonly<ClaimedJob> } & Pick<Parameters<typeof sendBotTask>[1], "task" | "token">
  >,
) {
  return sendBotTask(instance.core, { kind: relatedKind, claim: holding(job), task, token });
}

export function reclaimed(instance: Instance, job: Readonly<ClaimedJob>): void {
  exec(
    instance,
    "update jobs set state = 'running', claim_expires = ? where id = ?",
    Date.now() + 3_600_000,
    job.id,
  );
}
