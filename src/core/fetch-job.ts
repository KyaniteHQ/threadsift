import { givenUpTasks } from "./bot-task-states.ts";
import { FETCH_DEADLINE_MS } from "./fetch-link.ts";
import { outcomeOfFetched } from "./fetch-outcome.ts";
import { fetchedForJob } from "./fetch-source.ts";
import { type ClaimedJob, type JobHandler, type JobOutcome, type JobPorts } from "./job-outcome.ts";
import { redditRefOf } from "./links.ts";
import { redditClosed, redditClosing } from "./reddit-account-queue.ts";
import { failedFetch } from "./settle.ts";
import { handedToGrokBot } from "./x-intake-hand.ts";
import { xVerifyHandler } from "./x-verify-job.ts";

async function attemptFetch(ports: JobPorts, job: Readonly<ClaimedJob>): Promise<JobOutcome> {
  if (job.page === null) {
    const handed = await handedToGrokBot(ports, job);

    if (handed !== null) return handed;
  }

  const deadline = AbortSignal.timeout(FETCH_DEADLINE_MS);
  const fetched = await fetchedForJob(ports, job, deadline);

  return outcomeOfFetched(ports, job, fetched, deadline);
}

export const fetchHandler: JobHandler = {
  deadlineMs: FETCH_DEADLINE_MS,
  blockedBy: [],
  attempt: attemptFetch,
  exhausted: (db, job) => [failedFetch(db, job.itemId, "gave-up"), givenUpTasks(db, job)],
  closing: (db, job, how) => (redditRefOf(job.address) === null ? [] : redditClosing(db, job, how)),
  afterClosed: async (ports, job, closed) => {
    if (redditRefOf(job.address) !== null) await redditClosed(ports, job, closed);
  },
};

export const FETCH_HANDLERS: Readonly<Record<"fetch" | "x_verify", JobHandler>> = {
  fetch: fetchHandler,
  x_verify: xVerifyHandler,
};
