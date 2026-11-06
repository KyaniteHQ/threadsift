import { type SQL, and, asc, eq, inArray, lt, lte, notExists, exists, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { digestHandler, sweepDigests } from "./digest-job.ts";
import { fetchHandler } from "./fetch-job.ts";
import type { JobHandler, JobOutcome, JobPorts } from "./job-outcome.ts";
import { enqueueQuietly, enqueueRows, hasOpenJob } from "./job-rows.ts";
import { JOB_KINDS, type JobKind } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { type JobRow, guards, items, jobs, scheduledRuns } from "./schema.ts";

const CLAIM_MARGIN_MS = 120_000;
const RETRY_DELAYS_MS = [30_000, 120_000] as const;
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const SWEEP_LIMIT = 100;
const TICK_SPACING_MS = 30_000;

const HANDLERS: Readonly<Record<JobKind, JobHandler>> = {
  digest: digestHandler,
  fetch: fetchHandler,
};

const LEASE_MS = sql.join(
  JOB_KINDS.map((kind) => sql`when ${kind} then ${HANDLERS[kind].deadlineMs + CLAIM_MARGIN_MS}`),
  sql` `,
);

function isDue(now: number) {
  return and(
    or(
      and(eq(jobs.state, "queued"), lte(jobs.nextAttemptAt, now)),
      and(eq(jobs.state, "running"), lt(jobs.claimExpires, now)),
    ),
    or(
      ...JOB_KINDS.map((kind) =>
        and(
          eq(jobs.kind, kind),
          ...HANDLERS[kind].blockedBy.map((blocker) =>
            notExists(hasOpenJob(blocker, sql`${jobs.itemId}`)),
          ),
        ),
      ),
    ),
  );
}

function dueIds(db: Database, now: number, limit: number) {
  return db
    .select({ id: jobs.id })
    .from(jobs)
    .where(isDue(now))
    .orderBy(asc(jobs.nextAttemptAt), asc(jobs.id))
    .limit(limit);
}

async function claim(db: Database, which: () => SQL, now: number): Promise<JobRow | null> {
  const [claimed] = await db
    .update(jobs)
    .set({
      state: "running",
      claimExpires: sql`${now} + case ${jobs.kind} ${LEASE_MS} end`,
      attempts: sql`${jobs.attempts} + (${jobs.state} = 'running')`,
    })
    .where(and(which(), isDue(now)))
    .returning();

  return claimed ?? null;
}

export function claimNextDue(db: Database): Promise<JobRow | null> {
  const now = Date.now();

  return claim(db, () => inArray(jobs.id, dueIds(db, now, 1)), now);
}

function holding(db: Database, job: Readonly<JobRow>) {
  return db
    .select({ ok: sql<number>`count(*)`.as("ok") })
    .from(jobs)
    .where(and(eq(jobs.id, job.id), eq(jobs.state, "running"), eq(jobs.attempts, job.attempts)));
}

async function writeWhileHolding(
  db: Database,
  job: Readonly<JobRow>,
  writes: readonly BatchItem<"sqlite">[],
): Promise<boolean> {
  try {
    await db.batch([db.insert(guards).select(holding(db, job)), ...writes, db.delete(guards)]);

    return true;
  } catch (error) {
    const [{ ok } = { ok: 0 }] = await holding(db, job);

    if (ok === 1) {
      throw error;
    }

    return false;
  }
}

async function finish(
  ports: JobPorts,
  job: Readonly<JobRow>,
  { writes, attempts }: Readonly<{ writes: readonly BatchItem<"sqlite">[]; attempts: number }>,
): Promise<boolean> {
  const { db } = ports;
  const open = exists(hasOpenJob());

  const wrote = await writeWhileHolding(db, job, [
    ...writes,
    db
      .update(jobs)
      .set({ state: "done", attempts, claimExpires: null, catalogRetries: 0 })
      .where(eq(jobs.id, job.id)),
    db
      .update(items)
      .set({
        status: sql`case when ${items.status} = 'failed' then 'failed' when ${open} then 'processing' else 'ready' end`,
        reason: sql`case when ${items.status} = 'failed' then ${items.reason} when ${open} then null else ${items.reason} end`,
      })
      .where(eq(items.id, job.itemId)),
  ]);

  await enqueueItemJobs(ports, job.itemId);

  return wrote;
}

async function queueLater(
  ports: JobPorts,
  job: Readonly<JobRow>,
  {
    delayMs,
    attempts,
    catalogRetries = job.catalogRetries,
  }: Readonly<{ delayMs: number; attempts: number; catalogRetries?: number }>,
): Promise<void> {
  const wrote = await writeWhileHolding(ports.db, job, [
    ports.db
      .update(jobs)
      .set({
        state: "queued",
        attempts,
        catalogRetries,
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
): Promise<"done" | "lost" | "generation" | "catalog"> {
  try {
    return (await finish(ports, job, { writes: outcome.writes, attempts: job.attempts }))
      ? "done"
      : "lost";
  } catch (error) {
    const state = await outcome.currency?.current();

    if (state === undefined || state === "current") throw error;

    return state;
  }
}

async function applyOutcome(
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
    case "generation":
    case "catalog": {
      if (outcome.currency !== undefined) await ports.db.batch([outcome.currency.discard("stale")]);
      const catalogRetries = result === "catalog" ? job.catalogRetries + 1 : 0;
      await queueLater(ports, job, {
        delayMs: catalogRetries >= 2 ? 30_000 : 0,
        attempts: job.attempts,
        catalogRetries,
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

export async function executeClaimed(ports: JobPorts, job: Readonly<JobRow>): Promise<void> {
  const handler = HANDLERS[job.kind];

  if (job.attempts >= MAX_ATTEMPTS) {
    await finish(ports, job, {
      writes: handler.exhausted(ports.db, job),
      attempts: job.attempts,
    });

    return;
  }

  try {
    await applyOutcome(ports, job, await handler.attempt(ports, job));
  } catch (error) {
    console.error(`Job ${job.id} failed attempt ${job.attempts + 1}`, error);
    const delayMs = RETRY_DELAYS_MS[job.attempts];

    await (delayMs === undefined
      ? finish(ports, job, {
          writes: handler.exhausted(ports.db, job),
          attempts: job.attempts + 1,
        })
      : queueLater(ports, job, { delayMs, attempts: job.attempts + 1 }));
  }
}

export async function runJob(ports: JobPorts, id: number): Promise<void> {
  const job = await claim(ports.db, () => eq(jobs.id, id), Date.now());

  if (job !== null) {
    await executeClaimed(ports, job);
  }
}

export async function abandonRunning(db: Database): Promise<void> {
  await db.update(jobs).set({ claimExpires: 0 }).where(eq(jobs.state, "running"));
}

async function sweep(ports: JobPorts): Promise<void> {
  const now = Date.now();
  await sweepDigests(ports.db, now);
  const due = await dueIds(ports.db, now, SWEEP_LIMIT);

  await enqueueRows(ports, due);
}

async function claimSweep(db: Database, now: number): Promise<boolean> {
  const claimed = await db
    .insert(scheduledRuns)
    .values({ task: "sweep", lastRunAt: now })
    .onConflictDoUpdate({
      target: scheduledRuns.task,
      set: { lastRunAt: now },
      setWhere: lte(scheduledRuns.lastRunAt, now - TICK_SPACING_MS),
    })
    .returning({ task: scheduledRuns.task });

  return claimed.length > 0;
}

export async function tick(ports: JobPorts): Promise<void> {
  if (await claimSweep(ports.db, Date.now())) {
    await sweep(ports);
  }
}
