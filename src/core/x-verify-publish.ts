import { sql } from "drizzle-orm";

import { report } from "./failure-log.ts";
import { settledThread } from "./fetch-content.ts";
import type { ClaimedJob, JobPorts, SettledOutcome } from "./job-outcome.ts";
import { X_VERIFY_DEADLINE_MS } from "./request-waits.ts";
import { fewerThanStored, holdsAtLeastStored, ownerOfItem, repliesOf } from "./thread-store.ts";
import { NOTE_OF_REFUSAL } from "./x-fetcher.ts";
import { type Verification, verificationOf } from "./x-verify-read.ts";
import { type Progress, progressOf } from "./x-verify-state.ts";
import {
  type WithdrawnNote,
  guarded,
  reopened,
  afterRefusedRoot,
  revisionHolds,
  unreadableWrites,
} from "./x-verify-store.ts";
import { publishableThread } from "./x-verify-thread.ts";

type Ending = Exclude<Progress, { kind: "asking" }> | { readonly kind: "gave-up" };

type Ready = Extract<Progress, { kind: "ready" }>;

function currentRevision(ports: JobPorts, job: Readonly<ClaimedJob>, revision: number) {
  return { holds: revisionHolds(job.itemId, revision), rebuild: () => rebuilt(ports, job) };
}

export function withdrawn(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  revision: number,
  note: WithdrawnNote = null,
): SettledOutcome {
  return {
    writes: unreadableWrites(ports.db, job.itemId, revision, note),
    precondition: currentRevision(ports, job, revision),
  };
}

async function rebuilt(ports: JobPorts, job: Readonly<ClaimedJob>): Promise<SettledOutcome> {
  const stored = await verificationOf(ports.db, job.itemId);

  if (stored.kind === "missing") return { writes: [] };

  if (stored.kind === "unreadable") return withdrawn(ports, job, stored.revision);

  const { verification } = stored;
  const progress = progressOf(verification.thread, verification.judged);

  return progress.kind === "asking"
    ? { writes: [], continuation: [...reopened(ports.db, job.itemId, job.address)] }
    : ended(ports, job, verification, progress);
}

function reportVerified({
  thread,
  dropped,
  followUps,
  quoted,
  unverifiedTails,
  photoless,
}: Readonly<Ready>): void {
  report("x-verify", {
    replies: thread.replies.length,
    dropped,
    followUps,
    quoted,
    unverifiedTails,
    photoless,
  });
}

async function published(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  row: Readonly<Verification>,
  ready: Readonly<Ready>,
): Promise<SettledOutcome> {
  const thread = await publishableThread(ports.db, job.itemId, ready);

  if (thread === null) {
    report("x-fetch-refused", { category: "answer-refused" });

    return withdrawn(ports, job, row.revision, NOTE_OF_REFUSAL["answer-refused"]);
  }

  if (await fewerThanStored(ports.db, ownerOfItem(job.itemId), thread)) {
    report("x-fetch-refused", { category: "fewer-replies" });

    return withdrawn(ports, job, row.revision, NOTE_OF_REFUSAL["fewer-replies"]);
  }

  reportVerified(ready);

  const outcome = await settledThread(
    ports,
    job,
    thread,
    AbortSignal.timeout(X_VERIFY_DEADLINE_MS),
    row.digest,
  );

  const unchanged = sql`${revisionHolds(job.itemId, row.revision)} and ${holdsAtLeastStored(job.itemId, repliesOf(thread))}`;

  return guarded(ports.db, { itemId: job.itemId, revision: row.revision }, outcome, unchanged, () =>
    rebuilt(ports, job),
  );
}

export function ended(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  row: Readonly<Verification>,
  ending: Readonly<Ending>,
): Promise<SettledOutcome> {
  switch (ending.kind) {
    case "ready":
      return published(ports, job, row, ending);
    case "refused":
      report("x-verify-refused", { reason: "root" });

      return Promise.resolve({
        precondition: currentRevision(ports, job, row.revision),
        writes: afterRefusedRoot(ports.db, job, row),
      });
    case "gave-up":
      report("x-verify-refused", { reason: "unavailable" });

      return Promise.resolve(withdrawn(ports, job, row.revision, "x-unconfirmed"));
    default: {
      const exhaustive: never = ending;

      throw new Error(exhaustive);
    }
  }
}
