import { type SQLWrapper, and, eq, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { INTAKE_JOB_KINDS, type UnownedJobKind } from "../contract/job-contract.ts";
import { givenUpTasks, supersededTasks } from "./ai-task-rows.ts";
import type { Database } from "./database.ts";
import type { JobCurrency } from "./job-outcome.ts";
import { unownedAddress } from "./job-rows.ts";
import { jobOpen } from "./job-tables.ts";
import { type JobRow, aiTasks, jobs, xVerifications } from "./schema.ts";

const CLOSED_JOB = {
  state: "done",
  claimExpires: null,
  waitReason: null,
  attemptGeneration: null,
  attemptPending: null,
  staleRequeues: 0,
  page: null,
} as const;

export function closeJob(
  db: Database,
  job: Readonly<Pick<JobRow, "id">>,
  attempts: number,
): readonly BatchItem<"sqlite">[] {
  return [
    db
      .update(jobs)
      .set({ ...CLOSED_JOB, attempts })
      .where(eq(jobs.id, job.id)),
    ...givenUpTasks(db, eq(aiTasks.jobId, job.id)),
  ];
}

function closeJobs(db: Database, which: Readonly<SQLWrapper> | undefined) {
  return db.update(jobs).set(CLOSED_JOB).where(and(which, jobOpen()));
}

export function closeMatchingJobs(db: Database, which: Readonly<SQLWrapper>) {
  const matching = db.select({ id: jobs.id }).from(jobs).where(and(which, jobOpen()));

  return [supersededTasks(db, inArray(aiTasks.jobId, matching)), closeJobs(db, which)] as const;
}

export function closeRunJobs(db: Database, kind: UnownedJobKind, runId: number) {
  return closeJobs(db, and(eq(jobs.kind, kind), eq(jobs.address, unownedAddress(kind, runId))));
}

export function closeItemJobs(
  db: Database,
  itemId: Readonly<SQLWrapper>,
  { answering }: Readonly<{ answering?: number }> = {},
) {
  const ofItem = and(eq(jobs.itemId, sql`${itemId}`), inArray(jobs.kind, INTAKE_JOB_KINDS));
  const itemJobs = db.select({ id: jobs.id }).from(jobs).where(ofItem);

  return [
    supersededTasks(
      db,
      sql`${inArray(aiTasks.jobId, itemJobs)} and ${aiTasks.id} is not ${answering ?? null}`,
    ),
    closeJobs(db, ofItem),
    db.delete(xVerifications).where(eq(xVerifications.itemId, sql`${itemId}`)),
  ] as const;
}

export async function discardTask(
  db: Database,
  currency: JobCurrency | undefined,
  cause: Parameters<JobCurrency["discard"]>[0],
): Promise<void> {
  const [first, ...rest] = currency?.discard(cause) ?? [];

  if (first !== undefined) await db.batch([first, ...rest]);
}
