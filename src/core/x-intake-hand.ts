import { botStep } from "./bot-step.ts";
import { grokBotConnection } from "./grok-bot.ts";
import type { ClaimedJob, JobOutcome, JobPorts } from "./job-outcome.ts";
import { statusIdOf } from "./links.ts";
import { xIntakeKind } from "./x-intake.ts";

export async function handedToGrokBot(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
): Promise<JobOutcome | null> {
  if (statusIdOf(job.address) === null) return null;

  if ((await grokBotConnection(ports)).kind !== "ready") return null;

  return botStep(ports, job, xIntakeKind);
}
