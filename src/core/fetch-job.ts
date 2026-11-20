import { isRedditJob, readJob } from "./fetch-read.ts";
import { outcomeOfFetched } from "./fetch-settle.ts";
import type { ClaimedJob, JobOutcome, JobPorts } from "./job-outcome.ts";
import { defineJob } from "./job-spec.ts";
import { redditClosed, redditClosing } from "./reddit-account-queue.ts";
import { X_FETCH_DEADLINE_MS } from "./request-waits.ts";
import { failedFetch } from "./settle.ts";
import { botFailureNote } from "./x-intake-state.ts";
import { xIntakeKind } from "./x-intake.ts";
import { xVerifyHandler } from "./x-verify-job.ts";
import { queuedVerification } from "./x-verify-store.ts";

async function attemptFetch(ports: JobPorts, job: Readonly<ClaimedJob>): Promise<JobOutcome> {
  const read = await readJob(ports, job);

  if (read.kind === "bot") return xIntakeKind.attempt(ports, job);

  const { fetched, deadline } = read;

  if (fetched.status !== "to-verify") return outcomeOfFetched(ports, job, fetched, deadline);

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

export const fetchHandler = defineJob("fetch", {
  deadlineMs: X_FETCH_DEADLINE_MS,
  attempt: attemptFetch,
  exhausted: (db, job) => [failedFetch(db, job.itemId, "gave-up", botFailureNote(job.id))],
  closing: (db, job, how) => (isRedditJob(job) ? redditClosing(db, job, how) : []),
  afterClosed: async (ports, job, closed) => {
    if (isRedditJob(job)) await redditClosed(ports, job, closed);
  },
});

export const FETCH_HANDLERS = {
  fetch: fetchHandler,
  x_verify: xVerifyHandler,
};
