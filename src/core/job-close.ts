import { type SQLWrapper, and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { givenUpTasks, supersededTasks } from "./ai-tasks.ts";
import { openingDigest } from "./digest-job.ts";
import type { JobCurrency } from "./job-outcome.ts";
import type { Database } from "./ports.ts";
import { type JobRow, aiTasks, items, jobs, xVerifications } from "./schema.ts";

export const CLOSED_JOB = {
  state: "done",
  claimExpires: null,
  waitReason: null,
  attemptGeneration: null,
  attemptPending: null,
  staleRequeues: 0,
  page: null,
} as const;

function owedDigest(db: Database, job: Readonly<Pick<JobRow, "itemId" | "attemptPending">>) {
  return openingDigest(db, {
    scope:
      and(
        eq(items.id, sql`${job.itemId}`),
        isNotNull(items.pendingDigest),
        sql`${items.pendingDigest} is not ${job.attemptPending}`,
      ) ?? sql`0`,
    address: items.originalUrl,
    now: Date.now(),
  });
}

export function closeJob(
  db: Database,
  job: Readonly<Pick<JobRow, "id" | "kind" | "itemId" | "attemptPending">>,
  attempts: number,
): readonly BatchItem<"sqlite">[] {
  return [
    db
      .update(jobs)
      .set({ ...CLOSED_JOB, attempts })
      .where(eq(jobs.id, job.id)),
    ...givenUpTasks(db, eq(aiTasks.jobId, job.id)),
    ...(job.kind === "digest" && job.itemId !== null ? [owedDigest(db, job)] : []),
  ];
}

export function closeItemJobs(
  db: Database,
  itemId: Readonly<SQLWrapper>,
  { answering }: Readonly<{ answering?: number }> = {},
) {
  const ofItem = and(eq(jobs.itemId, sql`${itemId}`), inArray(jobs.kind, ["fetch", "x_verify"]));
  const itemJobs = db.select({ id: jobs.id }).from(jobs).where(ofItem);

  return [
    supersededTasks(
      db,
      sql`${inArray(aiTasks.jobId, itemJobs)} and ${aiTasks.id} is not ${answering ?? null}`,
    ),
    db
      .update(jobs)
      .set(CLOSED_JOB)
      .where(and(ofItem, ne(jobs.state, "done"))),
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
