import { type SQLWrapper, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import type { JobPorts } from "./job-outcome.ts";
import type { JobKind } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { items, jobs } from "./schema.ts";

const openJobs = alias(jobs, "open_jobs");

export function hasOpenJob(kind?: JobKind, itemId: Readonly<SQLWrapper> = sql`${items.id}`) {
  return sql`(select 1 from ${jobs} as open_jobs where ${openJobs.itemId} = ${itemId} and ${openJobs.state} <> 'done' ${kind === undefined ? sql`` : sql`and ${openJobs.kind} = ${kind}`})`;
}

export function openingJob(
  db: Database,
  {
    kind,
    address,
    normalizedUrl,
    now,
  }: Readonly<{
    kind: JobKind;
    address: string;
    normalizedUrl: string;
    now: number;
  }>,
) {
  return opening(db, { kind, address, now, where: eq(items.normalizedUrl, normalizedUrl) });
}

export function opening(
  db: Database,
  {
    kind,
    address,
    now,
    where,
  }: Readonly<{
    kind: JobKind;
    address: string | Readonly<SQLWrapper>;
    now: number;
    where: Readonly<SQLWrapper>;
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
          nextAttemptAt: sql<number>`${now}`.as("next_attempt_at"),
          claimExpires: sql<null>`null`.as("claim_expires"),
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
    console.error(`Jobs ${jobIds.join(", ")} were not queued; the next sweep queues them`, error);
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
