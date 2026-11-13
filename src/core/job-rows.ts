import { type SQLWrapper, and, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { z } from "zod";

import { logFailure } from "./failure-log.ts";
import { attemptFileKeys } from "./file-keys.ts";
import type { JobPorts } from "./job-outcome.ts";
import { ITEM_JOB_KINDS, type JobKind } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { type JobRow, items, jobs } from "./schema.ts";

export const ATTEMPT_FILES = attemptFileKeys(jobs);

const openJobs = alias(jobs, "open_jobs");

export const OpenedJobsSchema = z.array(z.object({ id: z.number().int() }));

export function hasOpenJob(kind?: JobKind, itemId: Readonly<SQLWrapper> = sql`${items.id}`) {
  const kinds = kind === undefined ? ITEM_JOB_KINDS : [kind];

  return sql`(select 1 from ${jobs} as open_jobs where ${openJobs.itemId} = ${itemId} and ${openJobs.state} <> 'done' and ${openJobs.kind} in (${sql.join(
    kinds.map((each) => sql`${each}`),
    sql`, `,
  )}))`;
}

export function holding(job: Readonly<Pick<JobRow, "id" | "attempts">>) {
  return sql`exists (select 1 from ${jobs} where ${jobs.id} = ${job.id} and ${jobs.state} = 'running' and ${jobs.attempts} = ${job.attempts})`;
}

export function openingJob(
  db: Database,
  {
    kind,
    address,
    normalizedUrl,
    now,
    page,
  }: Readonly<{
    kind: JobKind;
    address: string;
    normalizedUrl: string;
    now: number;
    page?: string | null | undefined;
  }>,
) {
  return opening(db, { kind, address, now, page, where: eq(items.normalizedUrl, normalizedUrl) });
}

export function opening(
  db: Database,
  {
    kind,
    address,
    now,
    where,
    page = null,
  }: Readonly<{
    kind: JobKind;
    address: string | Readonly<SQLWrapper>;
    now: number;
    where: Readonly<SQLWrapper>;
    page?: string | null | undefined;
  }>,
) {
  return db
    .insert(jobs)
    .select(
      db
        .select({
          id: sql<null>`null`.as("id"),
          kind: sql<JobKind>`${kind}`.as("kind"),
          itemId: items.id,
          address: sql<string>`${address}`.as("address"),
          state: sql<"queued">`'queued'`.as("state"),
          attempts: sql<number>`0`.as("attempts"),
          staleRequeues: sql<number>`0`.as("stale_requeues"),
          attemptGeneration: sql<null>`null`.as("attempt_generation"),
          nextAttemptAt: sql<number>`${now}`.as("next_attempt_at"),
          claimExpires: sql<null>`null`.as("claim_expires"),
          waitReason: sql<null>`null`.as("wait_reason"),
          page: sql<string | null>`${page}`.as("page"),
        })
        .from(items)
        .where(sql`${where}`),
    )
    .onConflictDoNothing()
    .returning({ id: jobs.id });
}

export async function enqueueQuietly(
  ports: JobPorts,
  jobIds: readonly number[],
  delayMs: number,
): Promise<void> {
  if (jobIds.length === 0) return;

  try {
    await ports.jobs.enqueue(jobIds, delayMs);
  } catch (error) {
    logFailure("jobs-not-queued", { jobIds: jobIds.join(",") }, error);
  }
}

export function enqueueRows(
  ports: JobPorts,
  rows: readonly Readonly<{ id: number }>[],
): Promise<void> {
  return enqueueQuietly(
    ports,
    rows.map(({ id }) => id),
    0,
  );
}

export async function enqueueItemJobs(ports: JobPorts, itemId: number): Promise<void> {
  try {
    await enqueueRows(
      ports,
      await ports.db
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.itemId, itemId), sql`${jobs.state} <> 'done'`)),
    );
  } catch (error) {
    logFailure("jobs-not-queued", { itemId }, error);
  }
}
