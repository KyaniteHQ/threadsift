import { and, eq, exists, isNotNull, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { openingDigest } from "./digest-job.ts";
import { databaseCodeOf, logFailure } from "./failure-log.ts";
import { namedKeys } from "./file-cleanup.ts";
import {
  MAX_STALE_REQUEUES,
  STALE_DELAYS_MS,
  type JobCurrency,
  type JobFiles,
  type JobHandler,
  NO_FILES,
  type JobOutcome,
  type JobPorts,
  type Precondition,
  type SettledOutcome,
} from "./job-outcome.ts";
import { CLOSED_JOB, enqueueItemJobs, enqueueQuietly, hasOpenJob, holding } from "./job-rows.ts";
import type { WaitReason } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { type JobRow, guardHolds, guardedBatch, items, jobs } from "./schema.ts";

function writeWhileHolding(
  db: Database,
  job: Readonly<JobRow>,
  writes: readonly BatchItem<"sqlite">[],
  precondition?: Readonly<Precondition>,
) {
  return guardedBatch(db, and(holding(job), precondition?.holds) ?? holding(job), writes);
}

function logClaimLost(job: Readonly<Pick<JobRow, "id" | "attempts">>): void {
  console.warn(JSON.stringify({ event: "job-claim-lost", jobId: job.id, attempt: job.attempts }));
}

async function deleteQuietly(
  ports: JobPorts,
  keys: readonly string[],
  doomed: (keys: readonly string[]) => Promise<readonly string[]> = (all) => Promise.resolve(all),
): Promise<void> {
  if (keys.length === 0) return;

  try {
    await ports.files.delete(await doomed(keys));
  } catch (error) {
    logFailure("file-not-deleted", { keys: keys.length }, error);
  }
}

async function unnamed(ports: JobPorts, keys: readonly string[]): Promise<readonly string[]> {
  const named = await namedKeys(ports.db, keys);

  return keys.filter((key) => !named.has(key));
}

function owedDigest(db: Database, itemId: number) {
  return openingDigest(db, {
    scope: and(eq(items.id, itemId), isNotNull(items.pendingDigest)) ?? sql`0`,
    address: items.originalUrl,
    now: Date.now(),
  }).job;
}

function closingWrites(
  db: Database,
  job: Readonly<JobRow>,
  attempts: number,
): readonly BatchItem<"sqlite">[] {
  const open = exists(hasOpenJob());

  return [
    db
      .update(jobs)
      .set({ ...CLOSED_JOB, attempts })
      .where(eq(jobs.id, job.id)),
    ...(job.kind === "digest" ? [owedDigest(db, job.itemId)] : []),
    db
      .update(items)
      .set({
        status: sql`case when ${items.status} = 'failed' then 'failed' when ${open} then 'processing' else 'ready' end`,
        reason: sql`case when ${items.status} = 'failed' then ${items.reason} when ${open} then null else ${items.reason} end`,
      })
      .where(eq(items.id, job.itemId)),
  ];
}

export async function finish(
  ports: JobPorts,
  job: Readonly<JobRow>,
  {
    writes,
    attempts,
    files = NO_FILES,
    precondition,
    continuation = [],
  }: Readonly<{
    writes: readonly BatchItem<"sqlite">[];
    attempts: number;
    files?: JobFiles | undefined;
    precondition?: Readonly<Precondition> | undefined;
    continuation?: readonly BatchItem<"sqlite">[] | undefined;
  }>,
): Promise<"done" | "lost" | Readonly<Precondition>> {
  const { db } = ports;

  const wrote = await writeWhileHolding(
    db,
    job,
    [...writes, ...closingWrites(db, job, attempts), ...continuation],
    precondition,
  );

  if (!wrote && precondition !== undefined && (await guardHolds(db, holding(job)))) {
    return precondition;
  }

  await afterClose(ports, job, wrote, files);

  return wrote ? "done" : "lost";
}

async function afterClose(
  ports: JobPorts,
  job: Readonly<JobRow>,
  wrote: boolean,
  files: JobFiles,
): Promise<void> {
  await enqueueItemJobs(ports, job.itemId);

  await (wrote
    ? deleteQuietly(ports, files.superseded)
    : deleteQuietly(ports, files.written, (keys) => unnamed(ports, keys)));

  if (!wrote) logClaimLost(job);
}

export async function exhaust(
  ports: JobPorts,
  job: Readonly<JobRow>,
  handler: Pick<JobHandler, "exhausted" | "inputCurrent">,
  attempts: number,
): Promise<void> {
  const { db } = ports;
  const sameInput = handler.inputCurrent?.(job);

  const wrote = await guardedBatch(db, and(holding(job), sameInput) ?? holding(job), [
    ...handler.exhausted(db, job),
    ...closingWrites(db, job, attempts),
  ]);

  if (!wrote && sameInput !== undefined && (await guardHolds(db, holding(job)))) {
    await queueLater(ports, job, {
      until: Date.now(),
      attempts: job.attempts,
      staleRequeues: 0,
      wait: null,
    });

    return;
  }

  await afterClose(ports, job, wrote, NO_FILES);
}

export async function queueLater(
  ports: JobPorts,
  job: Readonly<JobRow>,
  {
    until,
    attempts,
    staleRequeues,
    wait,
  }: Readonly<{ until: number; attempts: number; staleRequeues: number; wait: WaitReason | null }>,
): Promise<void> {
  const wrote = await writeWhileHolding(ports.db, job, [
    ports.db
      .update(jobs)
      .set({
        state: "queued",
        attempts,
        staleRequeues,
        nextAttemptAt: until,
        claimExpires: null,
        waitReason: wait,
      })
      .where(eq(jobs.id, job.id)),
  ]);

  if (wrote) {
    await enqueueQuietly(ports, [job.id], Math.max(0, until - Date.now()));
  } else {
    logClaimLost(job);
  }
}

async function writeOutcome(
  ports: JobPorts,
  job: Readonly<JobRow>,
  outcome: SettledOutcome,
): Promise<"done" | "lost" | "stale"> {
  let result: Awaited<ReturnType<typeof finish>>;

  try {
    result = await finish(ports, job, {
      writes: outcome.writes,
      attempts: job.attempts + (outcome.failedAttempt === true ? 1 : 0),
      files: outcome.files,
      precondition: outcome.precondition,
      continuation: outcome.continuation,
    });
  } catch (error) {
    const state = await outcome.currency?.current();

    if (state !== false) throw error;

    return "stale";
  }

  if (result === "done" || result === "lost") return result;

  return writeOutcome(ports, job, await result.rebuild());
}

async function discardTask(
  { db }: Readonly<Pick<JobPorts, "db">>,
  currency: JobCurrency | undefined,
  cause: Parameters<JobCurrency["discard"]>[0],
): Promise<void> {
  const [first, ...rest] = currency?.discard(cause) ?? [];

  if (first !== undefined) await db.batch([first, ...rest]);
}

async function applySettled(
  ports: JobPorts,
  job: Readonly<JobRow>,
  outcome: SettledOutcome,
): Promise<void> {
  let result: Awaited<ReturnType<typeof writeOutcome>>;

  try {
    result = await writeOutcome(ports, job, outcome);
  } catch (error) {
    logFailure(
      "job-write-failed",
      { jobId: job.id, kind: job.kind, databaseCode: databaseCodeOf(error) },
      error,
    );
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
        until: Date.now() + (STALE_DELAYS_MS[job.staleRequeues] ?? STALE_DELAYS_MS[2]),
        attempts: job.attempts,
        staleRequeues,
        wait: null,
      });
      break;
    }

    default: {
      const exhaustive: never = result;
      throw new Error(exhaustive);
    }
  }
}

export async function applyOutcome(
  ports: JobPorts,
  job: Readonly<JobRow>,
  outcome: JobOutcome,
): Promise<void> {
  if ("deferredUntil" in outcome) {
    await queueLater(ports, job, {
      until: outcome.deferredUntil,
      attempts: job.attempts + (outcome.countsAttempt ? 1 : 0),
      staleRequeues: job.staleRequeues,
      wait: outcome.wait,
    });

    return;
  }

  await applySettled(ports, job, outcome);
}
