import { eq, exists, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { logFailure } from "./failure-log.ts";
import {
  MAX_STALE_REQUEUES,
  STALE_DELAYS_MS,
  type JobCurrency,
  type JobFiles,
  type JobOutcome,
  type JobPorts,
} from "./job-outcome.ts";
import { enqueueItemJobs, enqueueQuietly, hasOpenJob, holding } from "./job-rows.ts";
import type { Database } from "./ports.ts";
import { type JobRow, guardedBatch, items, jobs } from "./schema.ts";

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
    logFailure("file-not-deleted", { key }, error);
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
      attempts: job.attempts + (outcome.failedAttempt === true ? 1 : 0),
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

async function discardTask(
  { db }: Readonly<Pick<JobPorts, "db">>,
  currency: JobCurrency | undefined,
  cause: Parameters<JobCurrency["discard"]>[0],
): Promise<void> {
  const write = currency?.discard(cause);

  if (write !== undefined) await db.batch([write]);
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
    await discardTask(ports, outcome.currency, "error");
    throw error;
  }

  switch (result) {
    case "done":
      break;
    case "lost":
      await discardTask(ports, outcome.currency, "lease-lost");
      break;
    case "stale": {
      await discardTask(ports, outcome.currency, "stale");
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
