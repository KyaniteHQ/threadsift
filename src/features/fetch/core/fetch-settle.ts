import type { Database } from "../../../core/kernel/database.ts";
import type { ClaimedJob, JobOutcome, JobPorts } from "../../../core/kernel/job-outcome.ts";
import { isLastAttempt } from "../../../core/kernel/job-retry.ts";
import { settledFetch } from "../../item/core/fetch-content.ts";
import { failedFetch } from "../../item/core/settle.ts";
import type { Fetched } from "../../media/core/details.ts";
import { apiPublished } from "../../x/core/x-api-publish.ts";
import type { XRead } from "../../x/core/x-reader.ts";
import { queuedVerification } from "../../x/core/x-verify-store.ts";

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
  fetched: Readonly<XRead>,
  deadline: AbortSignal,
): Promise<JobOutcome> | JobOutcome {
  if (fetched.status === "waiting") return waitingOutcome(ports.db, job, fetched);

  if (fetched.status === "x-api") return apiPublished(ports, job, fetched, deadline);

  if (fetched.status !== "to-verify") return settledFetch(ports, job, fetched, deadline, null);

  return {
    writes: queuedVerification(ports.db, {
      itemId: job.itemId,
      address: job.address,
      thread: fetched.thread,
      digest: null,
      cliAttempts: job.attempts,
    }),
  };
}
