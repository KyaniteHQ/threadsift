import { botStep } from "../src/core/bot-step.ts";
import { sendBotTask } from "../src/core/bot-task-send.ts";
import { startBotTask } from "../src/core/bot-task-start.ts";
import type { BotTaskRow } from "../src/core/bot-task-states.ts";
import { applyOutcome } from "../src/core/job-finish.ts";
import type { ClaimedJob } from "../src/core/job-outcome.ts";
import { relatedBotKind } from "../src/core/related-bot.ts";
import { openJob } from "./bot-task-fixtures.ts";
import type { Instance } from "./instance.ts";
import { exec, until } from "./related-fixtures.ts";

export async function startedTask(
  instance: Instance,
  job: Readonly<ClaimedJob>,
): Promise<{ readonly id: number; readonly token: string }> {
  const prepared = await until(
    () => relatedBotKind.prepare(instance.core.db, job),
    ({ kind }) => kind === "ask",
  );

  if (prepared.kind !== "ask") throw new Error("the Related pick has nothing to ask");

  const started = await startBotTask(instance.core, job, prepared.start);

  if (started.kind !== "started") throw new Error(`the task did not start: ${started.kind}`);

  return { id: started.task.id, token: started.token };
}

export async function taskAfterStart(instance: Instance, itemId: number) {
  const job = await openJob(instance, itemId);

  return { job, ...(await startedTask(instance, job)) };
}

export function step(instance: Instance, job: Readonly<ClaimedJob>) {
  return botStep(instance.core, job, relatedBotKind);
}

export async function settle(
  instance: Instance,
  job: Readonly<ClaimedJob>,
  holder: Readonly<ClaimedJob> = job,
): Promise<void> {
  await applyOutcome(instance.core, holder, await step(instance, job));
}

export function sendFor(
  instance: Instance,
  { job, task, token }: Readonly<{ job: Readonly<ClaimedJob>; task: BotTaskRow; token: string }>,
) {
  return sendBotTask(instance.core, { kind: relatedBotKind, job, task, token });
}

export function reclaimed(instance: Instance, job: Readonly<ClaimedJob>): void {
  exec(
    instance,
    "update jobs set state = 'running', claim_expires = ? where id = ?",
    Date.now() + 3_600_000,
    job.id,
  );
}
