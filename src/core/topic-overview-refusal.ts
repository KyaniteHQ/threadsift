import { type AiRefused, retriesAi } from "./ai-contract.ts";
import { currency } from "./digest-source.ts";
import { type ClaimedJob, type SettledOutcome, isLastAttempt } from "./job-outcome.ts";
import type { Database } from "./ports.ts";
import { insertGuard } from "./schema.ts";
import { type TopicLease, releaseTopicLease } from "./topic-lease.ts";
import type { OverviewPrompt, OverviewRead } from "./topic-overview-input.ts";
import { markOverviewFailed } from "./topic-overview-open.ts";
import { currentInputs } from "./topic-overview-write.ts";

export async function refusedOutcome(
  db: Database,
  lease: Readonly<TopicLease>,
  job: Readonly<ClaimedJob>,
  {
    result,
    read,
    prompt,
  }: Readonly<{
    result: Readonly<AiRefused & { readonly taskId: number | null }>;
    read: Readonly<OverviewRead>;
    prompt: Readonly<OverviewPrompt>;
  }>,
): Promise<SettledOutcome> {
  const retriable = retriesAi(result);
  const current = currentInputs(lease, read, prompt.included);
  const held = currency(db, current, result.taskId, [releaseTopicLease(db, lease)]);
  const stale = !(await held.current());

  if (!stale && retriable && !isLastAttempt(job.attempts)) {
    throw new Error(`Overview ${result.reason}`);
  }

  return {
    currency: held,
    failedAttempt: retriable,
    writes: [
      insertGuard(db, current),
      markOverviewFailed(db, lease, result.reason),
      releaseTopicLease(db, lease),
    ],
  };
}
