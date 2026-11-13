import { givenUpTasks } from "./bot-task-states.ts";
import { FETCH_DEADLINE_MS } from "./fetch-link.ts";
import { settledFetch } from "./fetch-settle.ts";
import { fetchedForJob } from "./fetch-source.ts";
import {
  type ClaimedJob,
  type JobHandler,
  type JobOutcome,
  type JobPorts,
  isLastAttempt,
} from "./job-outcome.ts";
import { failedFetch } from "./settle.ts";
import { handedToGrokBot } from "./x-intake-hand.ts";

function rateLimitGaveUp(db: JobPorts["db"], job: Readonly<ClaimedJob>): JobOutcome {
  return { writes: [failedFetch(db, job.itemId, "rate-limited")], failedAttempt: true };
}

function waitingOutcome(
  db: JobPorts["db"],
  job: Readonly<ClaimedJob>,
  { until, limited }: Readonly<{ until: number; limited: boolean }>,
): JobOutcome {
  if (limited && isLastAttempt(job.attempts)) return rateLimitGaveUp(db, job);

  return { deferredUntil: until, wait: "github-rate-limit", countsAttempt: limited };
}

async function attemptFetch(ports: JobPorts, job: Readonly<ClaimedJob>): Promise<JobOutcome> {
  if (job.page === null) {
    const handed = await handedToGrokBot(ports, job);

    if (handed !== null) return handed;
  }

  const deadline = AbortSignal.timeout(FETCH_DEADLINE_MS);
  const fetched = await fetchedForJob(ports, job, deadline);

  if (fetched.status === "waiting") return waitingOutcome(ports.db, job, fetched);

  return settledFetch(ports, job, fetched, deadline);
}

export const fetchHandler: JobHandler = {
  deadlineMs: FETCH_DEADLINE_MS,
  blockedBy: [],
  attempt: attemptFetch,
  exhausted: (db, job) => [failedFetch(db, job.itemId, "gave-up"), givenUpTasks(db, job)],
};
