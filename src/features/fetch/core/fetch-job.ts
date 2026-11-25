import { X_FETCH_DEADLINE_MS } from "../../../core/contract/request-waits.ts";
import type { ClaimedJob, JobOutcome, JobPorts } from "../../../core/kernel/job-outcome.ts";
import { defineJob } from "../../../core/kernel/job-spec.ts";
import { failedFetch } from "../../item/core/settle.ts";
import { botFailureNote } from "../../x/core/x-intake-state.ts";
import { xIntakeKind } from "../../x/core/x-intake.ts";
import { xVerifyHandler } from "../../x/core/x-verify-job.ts";
import { queuedVerification } from "../../x/core/x-verify-store.ts";
import { fetchClosed, fetchClosing } from "./fetch-closing.ts";
import { readJob } from "./fetch-read.ts";
import { outcomeOfFetched } from "./fetch-settle.ts";

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

const fetchHandler = defineJob("fetch", {
  deadlineMs: X_FETCH_DEADLINE_MS,
  attempt: attemptFetch,
  exhausted: (db, job) => [failedFetch(db, job.itemId, "gave-up", botFailureNote(job.id))],
  closing: fetchClosing,
  afterClosed: fetchClosed,
});

export const FETCH_HANDLERS = {
  fetch: fetchHandler,
  x_verify: xVerifyHandler,
};
