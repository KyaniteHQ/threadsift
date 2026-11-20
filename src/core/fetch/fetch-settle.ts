import { settledFetch } from "../item/fetch-content.ts";
import { failedFetch } from "../item/settle.ts";
import type { Database } from "../kernel/database.ts";
import type { ClaimedJob, JobOutcome, JobPorts } from "../kernel/job-outcome.ts";
import { isLastAttempt } from "../kernel/job-retry.ts";
import type { Fetched } from "../media/details.ts";

function rateLimitGaveUp(db: Database, job: Readonly<ClaimedJob>): JobOutcome {
  return { writes: [failedFetch(db, job.itemId, "rate-limited", null)], failedAttempt: true };
}

function waitingOutcome(
  db: Database,
  job: Readonly<ClaimedJob>,
  { until, limited, wait }: Readonly<Extract<Fetched, { status: "waiting" }>>,
): JobOutcome {
  if (limited && isLastAttempt(job.attempts)) return rateLimitGaveUp(db, job);

  return { deferredUntil: until, wait, countsAttempt: limited };
}

export function outcomeOfFetched(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  fetched: Readonly<Fetched>,
  deadline: AbortSignal,
): Promise<JobOutcome> | JobOutcome {
  if (fetched.status === "waiting") return waitingOutcome(ports.db, job, fetched);

  return settledFetch(ports, job, fetched, deadline, null);
}
