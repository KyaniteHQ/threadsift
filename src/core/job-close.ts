import { type SQLWrapper, and, eq, isNotNull, ne, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { openingDigest } from "./digest-job.ts";
import { setStatus } from "./item-status.ts";
import { ITEM_JOB_KINDS, type JobKind } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { type JobRow, items, jobs } from "./schema.ts";

const CLOSED_JOB = {
  state: "done",
  claimExpires: null,
  waitReason: null,
  attemptGeneration: null,
  staleRequeues: 0,
  page: null,
} as const;

function ownsItemStatus(kind: JobKind): boolean {
  return ITEM_JOB_KINDS.some((owner) => owner === kind);
}

function settlingItem(db: Database, itemId: number | Readonly<SQLWrapper>) {
  return setStatus(db, { kind: "jobs-changed" }, eq(items.id, itemId));
}

function owedDigest(db: Database, itemId: number) {
  return openingDigest(db, {
    scope: and(eq(items.id, itemId), isNotNull(items.pendingDigest)) ?? sql`0`,
    address: items.originalUrl,
    now: Date.now(),
  }).job;
}

export function closeJob(
  db: Database,
  job: Readonly<Pick<JobRow, "id" | "kind" | "itemId">>,
  attempts: number,
): readonly BatchItem<"sqlite">[] {
  return [
    db
      .update(jobs)
      .set({ ...CLOSED_JOB, attempts })
      .where(eq(jobs.id, job.id)),
    ...(job.kind === "digest" ? [owedDigest(db, job.itemId)] : []),
    ...(ownsItemStatus(job.kind) ? [settlingItem(db, job.itemId)] : []),
  ];
}

export function closeFetchJobs(db: Database, itemId: Readonly<SQLWrapper>) {
  return [
    db
      .update(jobs)
      .set(CLOSED_JOB)
      .where(and(eq(jobs.itemId, sql`${itemId}`), eq(jobs.kind, "fetch"), ne(jobs.state, "done"))),
    settlingItem(db, itemId),
  ] as const;
}
