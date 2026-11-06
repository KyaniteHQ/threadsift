import { type SQL, and, asc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { FETCH_DEADLINE_MS, fetchLink } from "./fetch-link.ts";
import { JOB_KINDS, type JobKind } from "./kinds.ts";
import type { Database, Ports } from "./ports.ts";
import { type JobRow, guards, items, jobs, scheduledRuns } from "./schema.ts";
import { isRetryable, settle } from "./settle.ts";

export type JobPorts = Pick<Ports, "db" | "network" | "pages" | "jobs">;

const CLAIM_MARGIN_MS = 120_000;
const RETRY_DELAYS_MS = [30_000, 120_000] as const;
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const SWEEP_LIMIT = 100;
const TICK_SPACING_MS = 30_000;

interface JobHandler {
  readonly deadlineMs: number;
  readonly attempt: (
    ports: JobPorts,
    job: Readonly<JobRow>,
  ) => Promise<readonly BatchItem<"sqlite">[]>;
  readonly exhausted: (db: Database, job: Readonly<JobRow>) => readonly BatchItem<"sqlite">[];
}

async function titleOf(db: Database, itemId: number): Promise<string | null> {
  const [item] = await db.select({ title: items.title }).from(items).where(eq(items.id, itemId));

  return item?.title ?? null;
}

async function attemptFetch(ports: JobPorts, job: Readonly<JobRow>) {
  const fetched = await fetchLink(ports.network, ports.pages, job.address);
  const title = isRetryable(fetched.status) ? await titleOf(ports.db, job.itemId) : null;

  return [
    ports.db
      .update(items)
      .set(settle(fetched, title, Date.now()))
      .where(eq(items.id, job.itemId)),
  ];
}

const HANDLERS: Readonly<Record<JobKind, JobHandler>> = {
  fetch: {
    deadlineMs: FETCH_DEADLINE_MS,
    attempt: attemptFetch,
    exhausted: (db, job) => [
      db.update(items).set({ status: "failed", reason: "gave-up" }).where(eq(items.id, job.itemId)),
    ],
  },
};

const LEASE_MS = sql.join(
  JOB_KINDS.map((kind) => sql`when ${kind} then ${HANDLERS[kind].deadlineMs + CLAIM_MARGIN_MS}`),
  sql` `,
);

export function hasOpenJob(kind: JobKind) {
  return sql`(select 1 from ${jobs} where ${jobs.itemId} = ${items.id} and ${jobs.kind} = ${kind} and ${jobs.state} <> 'done')`;
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
          nextAttemptAt: sql<number>`${now}`.as("next_attempt_at"),
          claimExpires: sql<null>`null`.as("claim_expires"),
        })
        .from(items)
        .where(eq(items.normalizedUrl, normalizedUrl)),
    )
    .onConflictDoNothing()
    .returning({ id: jobs.id });
}

function isDue(now: number) {
  return or(
    and(eq(jobs.state, "queued"), lte(jobs.nextAttemptAt, now)),
    and(eq(jobs.state, "running"), lt(jobs.claimExpires, now)),
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

export async function enqueueQuietly(
  ports: JobPorts,
  jobIds: readonly number[],
  delayMs: number,
): Promise<void> {
  try {
    await ports.jobs.enqueue(jobIds, delayMs);
  } catch (error) {
    console.error(`Jobs ${jobIds.join(", ")} were not queued; the next sweep queues them`, error);
  }
}

async function finish(
  db: Database,
  job: Readonly<JobRow>,
  { writes, attempts }: Readonly<{ writes: readonly BatchItem<"sqlite">[]; attempts: number }>,
): Promise<void> {
  await writeWhileHolding(db, job, [
    ...writes,
    db.update(jobs).set({ state: "done", attempts, claimExpires: null }).where(eq(jobs.id, job.id)),
  ]);
}

async function retryLater(ports: JobPorts, job: Readonly<JobRow>, delayMs: number): Promise<void> {
  const wrote = await writeWhileHolding(ports.db, job, [
    ports.db
      .update(jobs)
      .set({
        state: "queued",
        attempts: job.attempts + 1,
        nextAttemptAt: Date.now() + delayMs,
        claimExpires: null,
      })
      .where(eq(jobs.id, job.id)),
  ]);

  if (wrote) {
    await enqueueQuietly(ports, [job.id], delayMs);
  }
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
    await finish(ports.db, job, {
      writes: await handler.attempt(ports, job),
      attempts: job.attempts,
    });
  } catch (error) {
    console.error(`Job ${job.id} failed attempt ${job.attempts + 1}`, error);
    const delayMs = RETRY_DELAYS_MS[job.attempts];

    await (delayMs === undefined
      ? finish(ports.db, job, {
          writes: handler.exhausted(ports.db, job),
          attempts: job.attempts + 1,
        })
      : retryLater(ports, job, delayMs));
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

  if (due.length > 0) {
    await enqueueQuietly(
      ports,
      due.map(({ id }) => id),
      0,
    );
  }
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
