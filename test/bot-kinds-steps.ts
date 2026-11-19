import { botStep } from "../src/core/bot-step.ts";
import { BOT_TASK_KINDS } from "../src/core/bot-task-kinds.ts";
import { latestTask } from "../src/core/bot-task-states.ts";
import { applyOutcome } from "../src/core/job-finish.ts";
import type { ClaimedJob } from "../src/core/job-outcome.ts";
import type { BotKindName } from "./bot-kinds-cases.ts";
import { reclaimed } from "./bot-task-lifecycle.ts";
import type { Instance } from "./instance.ts";

export function outcomeOf(instance: Instance, kind: BotKindName, job: Readonly<ClaimedJob>) {
  return botStep(instance.core, job, BOT_TASK_KINDS[kind]);
}

export async function settled(
  instance: Instance,
  kind: BotKindName,
  job: Readonly<ClaimedJob>,
): Promise<void> {
  await applyOutcome(instance.core, job, await outcomeOf(instance, kind, job));
}

export async function appliedAgain(
  instance: Instance,
  kind: BotKindName,
  job: Readonly<ClaimedJob>,
): Promise<void> {
  const task = await latestTask(instance.core.db, job.id);

  if (task === null) throw new Error(`no task of job ${String(job.id)}`);

  reclaimed(instance, job);
  await applyOutcome(
    instance.core,
    job,
    await BOT_TASK_KINDS[kind].apply(instance.core, job, task),
  );
}
