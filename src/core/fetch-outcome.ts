import type { Fetched } from "./details.ts";
import { settledFetch } from "./fetch-settle.ts";
import { type ClaimedJob, type JobOutcome, type JobPorts, isLastAttempt } from "./job-outcome.ts";
import { failedFetch } from "./settle.ts";
import type { ToVerify } from "./x-fetcher.ts";
import { queuedVerification } from "./x-verify-store.ts";

function rateLimitGaveUp(db: JobPorts["db"], job: Readonly<ClaimedJob>): JobOutcome {
  return { writes: [failedFetch(db, job.itemId, "rate-limited", null)], failedAttempt: true };
}

function waitingOutcome(
  db: JobPorts["db"],
  job: Readonly<ClaimedJob>,
  { until, limited, wait }: Readonly<Extract<Fetched, { status: "waiting" }>>,
): JobOutcome {
  if (limited && isLastAttempt(job.attempts)) return rateLimitGaveUp(db, job);

  return { deferredUntil: until, wait, countsAttempt: limited };
}

export function outcomeOfFetched(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  fetched: Readonly<Fetched | ToVerify>,
  deadline: AbortSignal,
): Promise<JobOutcome> | JobOutcome {
  if (fetched.status === "waiting") return waitingOutcome(ports.db, job, fetched);

  if (fetched.status === "to-verify") {
    return {
      writes: queuedVerification(ports.db, {
        itemId: job.itemId,
        address: job.address,
        thread: fetched.thread,
        digest: null,
      }),
    };
  }

  return settledFetch(ports, job, fetched, deadline);
}
