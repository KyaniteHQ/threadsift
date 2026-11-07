import { and, eq, exists, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import {
  MAX_STALE_REQUEUES,
  STALE_DELAYS_MS,
  type JobFiles,
  type JobOutcome,
  type JobPorts,
} from "./job-outcome.ts";
import { enqueueQuietly, enqueueRows, hasOpenJob } from "./job-rows.ts";
import type { Database } from "./ports.ts";
import { type JobRow, guardedBatch, items, jobs } from "./schema.ts";

function holding(job: Readonly<JobRow>) {
  return sql`exists (select 1 from ${jobs} where ${jobs.id} = ${job.id} and ${jobs.state} = 'running' and ${jobs.attempts} = ${job.attempts})`;
}

function writeWhileHolding(
  db: Database,
  job: Readonly<JobRow>,
  writes: readonly BatchItem<"sqlite">[],
) {
  return guardedBatch(db, holding(job), writes);
}

const NO_FILES: JobFiles = { written: null, superseded: null };

async function deleteQuietly(ports: JobPorts, key: string | null): Promise<void> {
  if (key === null) return;

  try {
    await ports.files.delete([key]);
  } catch (error) {
    console.error(`File ${key} was not deleted; the next cleanup deletes it`, error);
  }
}

export async function finish(
  ports: JobPorts,
  job: Readonly<JobRow>,
  {
    writes,
    attempts,
    files = NO_FILES,
  }: Readonly<{
    writes: readonly BatchItem<"sqlite">[];
    attempts: number;
    files?: JobFiles | undefined;
  }>,
): Promise<boolean> {
  const { db } = ports;
  const open = exists(hasOpenJob());
  let wrote: boolean;

  try {
    wrote = await writeWhileHolding(db, job, [
      ...writes,
      db
        .update(jobs)
        .set({ state: "done", attempts, claimExpires: null, staleRequeues: 0 })
        .where(eq(jobs.id, job.id)),
      db
        .update(items)
        .set({
          status: sql`case when ${items.status} = 'failed' then 'failed' when ${open} then 'processing' else 'ready' end`,
          reason: sql`case when ${items.status} = 'failed' then ${items.reason} when ${open} then null else ${items.reason} end`,
        })
        .where(eq(items.id, job.itemId)),
    ]);
  } catch (error) {
    await deleteQuietly(ports, files.written);

    throw error;
  }

  await enqueueItemJobs(ports, job.itemId);
  await deleteQuietly(ports, wrote ? files.superseded : files.written);

  if (!wrote) {
    console.warn(JSON.stringify({ event: "job-claim-lost", jobId: job.id, attempt: job.attempts }));
  }

  return wrote;
}

export async function queueLater(
  ports: JobPorts,
  job: Readonly<JobRow>,
  {
    delayMs,
    attempts,
    staleRequeues,
  }: Readonly<{ delayMs: number; attempts: number; staleRequeues: number }>,
): Promise<void> {
  const wrote = await writeWhileHolding(ports.db, job, [
    ports.db
      .update(jobs)
      .set({
        state: "queued",
        attempts,
        staleRequeues,
        nextAttemptAt: Date.now() + delayMs,
        claimExpires: null,
      })
      .where(eq(jobs.id, job.id)),
  ]);

  if (wrote) {
    await enqueueQuietly(ports, [job.id], delayMs);
  }
}

async function writeOutcome(
  ports: JobPorts,
  job: Readonly<JobRow>,
  outcome: JobOutcome,
): Promise<"done" | "lost" | "stale"> {
  try {
    return (await finish(ports, job, {
      writes: outcome.writes,
      attempts: job.attempts,
      files: outcome.files,
    }))
      ? "done"
      : "lost";
  } catch (error) {
    const state = await outcome.currency?.current();

    if (state !== false) throw error;

    return "stale";
  }
}

export async function applyOutcome(
  ports: JobPorts,
  job: Readonly<JobRow>,
  outcome: JobOutcome,
): Promise<void> {
  let result: Awaited<ReturnType<typeof writeOutcome>>;

  try {
    result = await writeOutcome(ports, job, outcome);
  } catch (error) {
    if (outcome.currency !== undefined) await ports.db.batch([outcome.currency.discard("error")]);
    throw error;
  }

  switch (result) {
    case "done":
      break;
    case "lost":
      if (outcome.currency !== undefined)
        await ports.db.batch([outcome.currency.discard("lease-lost")]);
      break;
    case "stale": {
      if (outcome.currency !== undefined) await ports.db.batch([outcome.currency.discard("stale")]);
      const staleRequeues = Math.min(job.staleRequeues + 1, MAX_STALE_REQUEUES);
      await queueLater(ports, job, {
        delayMs: STALE_DELAYS_MS[job.staleRequeues] ?? STALE_DELAYS_MS[2],
        attempts: job.attempts,
        staleRequeues,
      });
      break;
    }

    default: {
      const exhaustive: never = result;
      throw new Error(exhaustive);
    }
  }
}

async function enqueueItemJobs(ports: JobPorts, itemId: number): Promise<void> {
  const queued = await ports.db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.itemId, itemId), sql`${jobs.state} <> 'done'`));

  await enqueueRows(ports, queued);
}
