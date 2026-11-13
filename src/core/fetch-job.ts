import { botFailureNote, givenUpTasks } from "./bot-task-states.ts";
import { attemptFetch } from "./fetch-attempt.ts";
import { FETCH_DEADLINE_MS } from "./fetch-link.ts";
import type { JobHandler } from "./job-outcome.ts";
import { redditRefOf } from "./links.ts";
import { redditClosed, redditClosing } from "./reddit-account-queue.ts";
import { failedFetch } from "./settle.ts";
import { xVerifyHandler } from "./x-verify-job.ts";

export const fetchHandler: JobHandler = {
  deadlineMs: FETCH_DEADLINE_MS,
  blockedBy: [],
  attempt: attemptFetch,
  exhausted: (db, job) => [
    failedFetch(db, job.itemId, "gave-up", botFailureNote(job.id)),
    givenUpTasks(db, job),
  ],
  closing: (db, job, how) => (redditRefOf(job.address) === null ? [] : redditClosing(db, job, how)),
  afterClosed: async (ports, job, closed) => {
    if (redditRefOf(job.address) !== null) await redditClosed(ports, job, closed);
  },
};

export const FETCH_HANDLERS: Readonly<Record<"fetch" | "x_verify", JobHandler>> = {
  fetch: fetchHandler,
  x_verify: xVerifyHandler,
};
