import type { AiRefused } from "./ai-contract.ts";
import { refusalOutcome } from "./guarded-outcome.ts";
import type { ClaimedJob, SettledOutcome } from "./job-outcome.ts";
import type { Database } from "./ports.ts";
import { type TopicLease, releaseTopicLease } from "./topic-lease.ts";
import type { OverviewPrompt, OverviewRead } from "./topic-overview-input.ts";
import { markOverviewFailed } from "./topic-overview-open.ts";
import { currentInputs } from "./topic-overview-write.ts";

export function refusedOutcome(
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
  return refusalOutcome(db, job, {
    result,
    current: currentInputs(lease, read, prompt.included),
    label: "Overview",
    writes: [markOverviewFailed(db, lease, result.reason)],
    cleanup: [releaseTopicLease(db, lease)],
  });
}
