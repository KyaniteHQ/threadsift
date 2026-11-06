import { type SQL, and, asc, eq, inArray, lt, lte, notExists, exists, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { digestHandler } from "./digest-job.ts";
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

function finish(
  db: Database,
  job: Readonly<JobRow>,
  { writes, attempts }: Readonly<{ writes: readonly BatchItem<"sqlite">[]; attempts: number }>,
): Promise<boolean> {
  const open = exists(hasOpenJob());

  return writeWhileHolding(db, job, [
    ...writes,
    db.update(jobs).set({ state: "done", attempts, claimExpires: null }).where(eq(jobs.id, job.id)),
    db
      .update(items)
      .set({
        status: sql`case when ${open} then 'processing' when ${items.status} = 'failed' then 'failed' else 'ready' end`,
        reason: sql`case when ${open} then null else ${items.reason} end`,
      })
      .where(eq(items.id, job.itemId)),
  ]);
}

async function queueLater(
  ports: JobPorts,
  job: Readonly<JobRow>,
  { delayMs, attempts }: Readonly<{ delayMs: number; attempts: number }>,
): Promise<void> {
  const wrote = await writeWhileHolding(ports.db, job, [
    ports.db
      .update(jobs)
      .set({
        state: "queued",
        attempts,
        nextAttemptAt: Date.now() + delayMs,
        claimExpires: null,
      })
      .where(eq(jobs.id, job.id)),
  ]);

  if (wrote) {
    await enqueueQuietly(ports, [job.id], delayMs);
  }
}

async function applyOutcome(
  ports: JobPorts,
  job: Readonly<JobRow>,
  outcome: JobOutcome,
): Promise<void> {
  try {
    const wrote = await finish(ports.db, job, { writes: outcome.writes, attempts: job.attempts });

    if (!wrote && outcome.currency !== undefined)
      await ports.db.batch([outcome.currency.discard("lease-lost")]);
  } catch (error) {
    if (outcome.currency === undefined) throw error;
    const current = await outcome.currency.current();
    await ports.db.batch([outcome.currency.discard(current ? "error" : "stale")]);

    if (current) throw error;
    await queueLater(ports, job, { delayMs: 0, attempts: job.attempts });

    return;
  }

  await enqueueItemJobs(ports, job.itemId);
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
    await finish(ports.db, job, {
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
      ? finish(ports.db, job, {
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
  const due = await dueIds(ports.db, Date.now(), SWEEP_LIMIT);

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
