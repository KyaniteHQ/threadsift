import { sql } from "drizzle-orm";

import { report } from "./failure-log.ts";
import { settledFetch } from "./fetch-settle.ts";
import type { ClaimedJob, JobPorts, SettledOutcome } from "./job-outcome.ts";
import { ownerOfItem } from "./reddit-thread.ts";
import { NOTE_OF_REFUSAL } from "./x-fetcher.ts";
import { fewerThanStored, holdsAtLeastStored, publishableThread } from "./x-partial.ts";
import { type Verification, verificationOf } from "./x-verify-read.ts";
import { type Progress, progressOf } from "./x-verify-state.ts";
import {
  type WithdrawnNote,
  forgotten,
  reopened,
  revisionHolds,
  unreadableWrites,
} from "./x-verify-store.ts";

const PUBLISH_DEADLINE_MS = 90_000;

type Ending = Exclude<Progress, { kind: "asking" }> | { readonly kind: "gave-up" };

type Ready = Extract<Progress, { kind: "ready" }>;

export function withdrawn(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  revision: number,
  note: WithdrawnNote = null,
): SettledOutcome {
  return {
    writes: unreadableWrites(ports.db, job.itemId, revision, note),
    precondition: {
      holds: revisionHolds(job.itemId, revision),
      rebuild: () => rebuilt(ports, job),
    },
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

function guarded(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  row: Readonly<Verification>,
  outcome: Readonly<SettledOutcome>,
  replies: number,
): SettledOutcome {
  return {
    ...outcome,
    writes: [...outcome.writes, forgotten(ports.db, job.itemId, row.revision)],
    precondition: {
      holds: sql`${revisionHolds(job.itemId, row.revision)} and ${holdsAtLeastStored(job.itemId, replies)} and ${outcome.precondition?.holds ?? sql`1`}`,
      rebuild: () => rebuilt(ports, job),
    },
  };
}

async function published(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  row: Readonly<Verification>,
  ready: Readonly<Ready>,
): Promise<SettledOutcome> {
  const thread = await publishableThread(ports.db, job.itemId, ready.thread);

  if (thread === null) {
    report("x-fetch-refused", { category: "answer-refused" });

    return withdrawn(ports, job, row.revision, NOTE_OF_REFUSAL["answer-refused"]);
  }

  if (await fewerThanStored(ports.db, ownerOfItem(job.itemId), thread)) {
    report("x-fetch-refused", { category: "fewer-replies" });

    return withdrawn(ports, job, row.revision, NOTE_OF_REFUSAL["fewer-replies"]);
  }

  report("x-verify", {
    replies: ready.thread.replies.length,
    dropped: ready.dropped,
    unverifiedTails: ready.unverifiedTails,
  });

  const outcome = await settledFetch(
    ports,
    job,
    {
      status: "ok",
      found: {
        title: thread.title,
        author: thread.author,
        community: null,
        content: { kind: "thread", thread, archivedAt: null },
      },
    },
    AbortSignal.timeout(PUBLISH_DEADLINE_MS),
    row.digest,
  );

  return guarded(
    ports,
    job,
    row,
    outcome,
    thread.nodes.filter(({ kind }) => kind === "comment").length,
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

      return Promise.resolve(withdrawn(ports, job, row.revision, "x-unconfirmed"));
    case "gave-up":
      report("x-verify-refused", { reason: "unavailable" });

      return Promise.resolve(withdrawn(ports, job, row.revision, "x-unconfirmed"));
    default: {
      const exhaustive: never = ending;

      throw new Error(exhaustive);
    }
  }
}
