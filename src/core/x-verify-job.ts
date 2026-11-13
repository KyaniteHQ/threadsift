import { report } from "./failure-log.ts";
import {
  type ClaimedJob,
  type JobHandler,
  type JobOutcome,
  type JobPorts,
  RETRY_DELAYS_MS,
  isLastAttempt,
} from "./job-outcome.ts";
import { ended, withdrawn } from "./x-verify-publish.ts";
import { type Verification, verificationOf } from "./x-verify-read.ts";
import { progressOf } from "./x-verify-state.ts";
import { revisionHolds, savedProgress, unreadableWrites } from "./x-verify-store.ts";
import { askedSlice } from "./x-verify.ts";

const SLICE_DEADLINE_MS = 90_000;

async function slice(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  row: Readonly<Verification>,
): Promise<JobOutcome> {
  const asked = await askedSlice(
    ports.network,
    row.thread,
    row.judged,
    AbortSignal.timeout(SLICE_DEADLINE_MS),
  );

  const judged = { ...row.judged, ...asked.added };
  const next = progressOf(row.thread, judged);

  report("x-verify-slice", {
    requests: asked.requests,
    judged: Object.keys(asked.added).length,
    unavailable: asked.unavailable ? 1 : 0,
  });

  if (next.kind !== "asking") return ended(ports, job, { ...row, judged }, next);

  if (asked.unavailable && isLastAttempt(job.attempts)) {
    return ended(ports, job, { ...row, judged }, { kind: "gave-up" });
  }

  return {
    deferredUntil: Date.now() + (asked.unavailable ? (RETRY_DELAYS_MS[job.attempts] ?? 0) : 0),
    wait: asked.unavailable ? "x-verify" : null,
    countsAttempt: asked.unavailable,
    writes: [savedProgress(ports.db, job.itemId, row.revision, judged)],
  };
}

async function attemptVerification(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
): Promise<JobOutcome> {
  const stored = await verificationOf(ports.db, job.itemId);

  if (stored.kind === "missing") return { writes: [] };

  if (stored.kind === "unreadable") {
    report("x-verify-refused", { reason: "stored-unreadable" });

    return withdrawn(ports, job, stored.revision);
  }

  const { verification } = stored;
  const progress = progressOf(verification.thread, verification.judged);

  return progress.kind === "asking"
    ? slice(ports, job, verification)
    : ended(ports, job, verification, progress);
}

export const xVerifyHandler: JobHandler = {
  deadlineMs: SLICE_DEADLINE_MS,
  blockedBy: [],
  attempt: attemptVerification,
  exhausted: (db, job) => unreadableWrites(db, job.itemId, job.attemptGeneration),
  inputCurrent: ({ itemId, attemptGeneration }) => revisionHolds(itemId, attemptGeneration),
};
