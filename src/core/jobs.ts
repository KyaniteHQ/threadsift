import { and, asc, eq, lt, lte, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { fetchLink } from "./fetch-link.ts";
import type { JobKind } from "./kinds.ts";
import type { Database, Ports } from "./ports.ts";
import { type ItemRow, type JobRow, guards, items, jobs, scheduledRuns } from "./schema.ts";
import { settle } from "./settle.ts";

export type JobPorts = Pick<Ports, "db" | "network" | "jobs">;

export const FETCH_DEADLINE_MS = 120_000;
export const CLAIM_MARGIN_MS = 120_000;
export const MAX_ATTEMPTS = 3;
export const RETRY_DELAYS_MS = [30_000, 120_000] as const;
export const SWEEP_LIMIT = 100;
export const TICK_SPACING_MS = 30_000;

const DEADLINE_MS: Readonly<Record<JobKind, number>> = { fetch: FETCH_DEADLINE_MS };

export function hasOpenJob(kind: JobKind) {
  return sql`(select 1 from ${jobs} where ${jobs.itemId} = ${items.id} and ${jobs.kind} = ${kind} and ${jobs.state} <> 'done')`;
}

function isDue(now: number) {
  return or(
    and(eq(jobs.state, "queued"), lte(jobs.nextAttemptAt, now)),
    and(eq(jobs.state, "running"), lt(jobs.claimExpires, now)),
  );
}

async function claim(db: Database, id: number, now: number): Promise<JobRow | null> {
  const [claimed] = await db
    .update(jobs)
    .set({
      state: "running",
      claimExpires: now + FETCH_DEADLINE_MS + CLAIM_MARGIN_MS,
      attempts: sql`${jobs.attempts} + (${jobs.state} = 'running')`,
    })
    .where(and(eq(jobs.id, id), isDue(now)))
    .returning();

  return claimed ?? null;
}

async function nextDueId(db: Database, now: number): Promise<number | null> {
  const [next] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(isDue(now))
    .orderBy(asc(jobs.nextAttemptAt), asc(jobs.id))
    .limit(1);

  return next?.id ?? null;
}

export async function claimNextDue(db: Database): Promise<JobRow | null> {
  const id = await nextDueId(db, Date.now());

  if (id === null) {
    return null;
  }

  return (await claim(db, id, Date.now())) ?? claimNextDue(db);
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

async function attemptFetch(ports: JobPorts, job: Readonly<JobRow>) {
  const [item] = await ports.db.select().from(items).where(eq(items.id, job.itemId));

  if (item === undefined) {
    throw new Error(`Job ${job.id} names Item ${job.itemId}, which does not exist`);
  }

  const { fetched } = await fetchLink(
    ports.network,
    job.address,
    AbortSignal.timeout(DEADLINE_MS[job.kind]),
  );

  return settle(fetched, item.title, Date.now());
}

async function enqueueQuietly(ports: JobPorts, jobId: number, delayMs: number): Promise<void> {
  try {
    await ports.jobs.enqueue(jobId, delayMs);
  } catch (error) {
    console.error(`Job ${jobId} was not queued; the next sweep queues it`, error);
  }
}

async function ending(
  db: Database,
  job: Readonly<JobRow>,
  end: Readonly<{ item: Readonly<Partial<ItemRow>>; attempts: number }>,
): Promise<void> {
  await writeWhileHolding(db, job, [
    db.update(items).set(end.item).where(eq(items.id, job.itemId)),
    db
      .update(jobs)
      .set({ state: "done", attempts: end.attempts, claimExpires: null })
      .where(eq(jobs.id, job.id)),
  ]);
}

function giveUp(db: Database, job: Readonly<JobRow>, attempts: number): Promise<void> {
  return ending(db, job, { item: { status: "failed", reason: "gave-up" }, attempts });
}

async function retryLater(ports: JobPorts, job: Readonly<JobRow>): Promise<void> {
  const failed = job.attempts + 1;
  const delayMs = RETRY_DELAYS_MS[failed - 1] ?? RETRY_DELAYS_MS.at(-1) ?? 0;

  const wrote = await writeWhileHolding(ports.db, job, [
    ports.db
      .update(jobs)
      .set({
        state: "queued",
        attempts: failed,
        nextAttemptAt: Date.now() + delayMs,
        claimExpires: null,
      })
      .where(eq(jobs.id, job.id)),
  ]);

  if (wrote) {
    await enqueueQuietly(ports, job.id, delayMs);
  }
}

export async function executeClaimed(ports: JobPorts, job: Readonly<JobRow>): Promise<void> {
  if (job.attempts >= MAX_ATTEMPTS) {
    await giveUp(ports.db, job, job.attempts);

    return;
  }

  try {
    await ending(ports.db, job, { item: await attemptFetch(ports, job), attempts: job.attempts });
  } catch (error) {
    console.error(`Job ${job.id} failed attempt ${job.attempts + 1}`, error);

    await (job.attempts + 1 >= MAX_ATTEMPTS
      ? giveUp(ports.db, job, job.attempts + 1)
      : retryLater(ports, job));
  }
}

export async function runJob(ports: JobPorts, id: number): Promise<void> {
  const job = await claim(ports.db, id, Date.now());

  if (job !== null) {
    await executeClaimed(ports, job);
  }
}

export async function abandonRunning(db: Database): Promise<void> {
  await db.update(jobs).set({ claimExpires: 0 }).where(eq(jobs.state, "running"));
}

async function sweep(ports: JobPorts): Promise<void> {
  const due = await ports.db
    .select({ id: jobs.id })
    .from(jobs)
    .where(isDue(Date.now()))
    .orderBy(asc(jobs.nextAttemptAt), asc(jobs.id))
    .limit(SWEEP_LIMIT);

  await Promise.all(due.map(({ id }) => enqueueQuietly(ports, id, 0)));
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
