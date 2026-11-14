import { type SQLWrapper, and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { givenUpTasks } from "./bot-task-states.ts";
import { openingDigest } from "./digest-job.ts";
import { setStatus } from "./item-status.ts";
import { ITEM_JOB_KINDS } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { type JobRow, items, jobs, xVerifications } from "./schema.ts";

const CLOSED_JOB = {
  state: "done",
  claimExpires: null,
  waitReason: null,
  attemptGeneration: null,
  staleRequeues: 0,
  page: null,
} as const;

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
    givenUpTasks(db, job),
    ...(job.kind === "digest" ? [owedDigest(db, job.itemId)] : []),
    ...(ITEM_JOB_KINDS.some((owner) => owner === job.kind)
      ? [setStatus(db, { kind: "jobs-changed" }, eq(items.id, job.itemId))]
      : []),
  ];
}

export function closeItemJobs(db: Database, itemId: Readonly<SQLWrapper>) {
  return [
    db
      .update(jobs)
      .set(CLOSED_JOB)
      .where(
        and(
          eq(jobs.itemId, sql`${itemId}`),
          inArray(jobs.kind, ["fetch", "x_verify"]),
          ne(jobs.state, "done"),
        ),
      ),
    db.delete(xVerifications).where(eq(xVerifications.itemId, sql`${itemId}`)),
  ] as const;
}
