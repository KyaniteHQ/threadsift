import { botStep } from "../src/core/bot-step.ts";
import { reparsed } from "../src/core/bot-task-apply.ts";
import { BOT_TASK_KINDS } from "../src/core/bot-task-kinds.ts";
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
  {
    job,
    task,
  }: Readonly<{
    job: Readonly<ClaimedJob>;
    task: Readonly<{ id: number; context: string | null; result: string | null }>;
  }>,
): Promise<void> {
  const parsed = reparsed(BOT_TASK_KINDS[kind], task);

  if (parsed.kind !== "valid")
    throw new Error(`the stored answer no longer fits: ${parsed.reasons}`);

  reclaimed(instance, job);
  await applyOutcome(instance.core, job, await parsed.apply(instance.core, job, task));
}
