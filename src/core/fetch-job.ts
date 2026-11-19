import { botFailureNote } from "./bot-task-states.ts";
import { attemptFetch } from "./fetch-attempt.ts";
import { defineJob } from "./job-spec.ts";
import { redditRefOf } from "./links.ts";
import { redditClosed, redditClosing } from "./reddit-account-queue.ts";
import { X_RUN_DEADLINE_MS, X_SLOT_WAIT_MS } from "./request-waits.ts";
import { failedFetch } from "./settle.ts";
import { xVerifyHandler } from "./x-verify-job.ts";

export const fetchHandler = defineJob("fetch", {
  deadlineMs: X_RUN_DEADLINE_MS + X_SLOT_WAIT_MS,
  attempt: attemptFetch,
  exhausted: (db, job) => [failedFetch(db, job.itemId, "gave-up", botFailureNote(job.id))],
  closing: (db, job, how) => (redditRefOf(job.address) === null ? [] : redditClosing(db, job, how)),
  afterClosed: async (ports, job, closed) => {
    if (redditRefOf(job.address) !== null) await redditClosed(ports, job, closed);
  },
});

export const FETCH_HANDLERS = {
  fetch: fetchHandler,
  x_verify: xVerifyHandler,
};
