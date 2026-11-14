import {
  type SQL,
  type SQLWrapper,
  and,
  asc,
  eq,
  gte,
  isNull,
  lte,
  ne,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { CLAIM_MARGIN_MS, type Closing, type JobPorts } from "./job-outcome.ts";
import { enqueueQuietly } from "./job-rows.ts";
import type { Database } from "./ports.ts";
import { type AccountRow, redditAccount } from "./reddit-account-tables.ts";
import { type JobRow, jobs } from "./schema.ts";

export const FILL_DEADLINE_MS = 90_000;

export const WAIT_CHECK_MS = 300_000;

const ACCOUNT_ROW = 1;

const WAITING = and(
  eq(jobs.kind, "fetch"),
  eq(jobs.state, "queued"),
  eq(jobs.waitReason, "reddit-limit"),
);

const OLDEST_WAITING = sql`(select min(${jobs.id}) from ${jobs} where ${WAITING})`;

function jobIsOpen(db: Database, id: SQLWrapper) {
  return db
    .select({ one: sql`1` })
    .from(jobs)
    .where(and(eq(jobs.id, sql`${id}`), ne(jobs.state, "done")));
}

function turnIsFree(db: Database, jobId: number, now: number): SQL | undefined {
  return and(
    eq(redditAccount.id, ACCOUNT_ROW),
    eq(redditAccount.state, "connected"),
    or(
      isNull(redditAccount.busyUntil),
      lte(redditAccount.busyUntil, now),
      eq(redditAccount.busyJob, jobId),
      notExists(jobIsOpen(db, redditAccount.busyJob)),
    ),
    or(isNull(redditAccount.limitedUntil), lte(redditAccount.limitedUntil, now)),
    or(
      isNull(redditAccount.windowRemaining),
      gte(redditAccount.windowRemaining, 1),
      isNull(redditAccount.windowResetsAt),
      lte(redditAccount.windowResetsAt, now),
    ),
  );
}

function queueAllows(db: Database, jobId: number): SQL | undefined {
  return or(
    isNull(redditAccount.queueHead),
    gte(redditAccount.queueHead, jobId),
    notExists(jobIsOpen(db, redditAccount.queueHead)),
  );
}

export async function takeTurn(
  db: Database,
  jobId: number,
  now: number,
): Promise<AccountRow | null> {
  const [taken] = await db
    .update(redditAccount)
    .set({
      busyJob: jobId,
      busyUntil: now + FILL_DEADLINE_MS + CLAIM_MARGIN_MS,
      queueHead: sql`(select min(${jobs.id}) from ${jobs} where ${WAITING} and ${jobs.id} <> ${jobId})`,
    })
    .where(and(turnIsFree(db, jobId, now), queueAllows(db, jobId)))
    .returning();

  return taken ?? null;
}

export function resumeAt(row: Readonly<AccountRow>, now: number): number {
  const holds = [row.limitedUntil, row.windowRemaining === 0 ? row.windowResetsAt : null].filter(
    (until): until is number => until !== null && until > now,
  );

  return Math.min(now + WAIT_CHECK_MS, holds.length === 0 ? Infinity : Math.max(...holds));
}

function releaseTurn(db: Database, jobId: number): BatchItem<"sqlite"> {
  return db
    .update(redditAccount)
    .set({ busyJob: null, busyUntil: null })
    .where(eq(redditAccount.busyJob, jobId));
}

function wakeOldest(db: Database, jobId: number, now: number): BatchItem<"sqlite"> {
  return db
    .update(jobs)
    .set({ nextAttemptAt: now })
    .where(
      and(
        WAITING,
        eq(jobs.id, sql`${OLDEST_WAITING}`),
        sql`exists (select 1 from ${redditAccount} where ${redditAccount.busyJob} = ${jobId})`,
      ),
    );
}

function deferTurn(db: Database, jobId: number, waits: boolean): BatchItem<"sqlite"> {
  const headStays = sql`${redditAccount.queueHead} is not null and ${redditAccount.queueHead} < ${jobId} and exists (select 1 from ${jobs} where ${jobs.id} = ${redditAccount.queueHead} and ${jobs.state} <> 'done')`;
  const holds = sql`${redditAccount.busyJob} = ${jobId}`;

  return db
    .update(redditAccount)
    .set({
      busyJob: sql`case when ${holds} then null else ${redditAccount.busyJob} end`,
      busyUntil: sql`case when ${holds} then null else ${redditAccount.busyUntil} end`,
      queueHead: waits
        ? sql`case when ${headStays} then ${redditAccount.queueHead} else min(${jobId}, coalesce(${OLDEST_WAITING}, ${jobId})) end`
        : redditAccount.queueHead,
    })
    .where(eq(redditAccount.id, ACCOUNT_ROW));
}

export function redditClosing(
  db: Database,
  job: Readonly<Pick<JobRow, "id">>,
  how: Closing,
): readonly BatchItem<"sqlite">[] {
  return how.kind === "closed"
    ? [wakeOldest(db, job.id, Date.now()), releaseTurn(db, job.id)]
    : [deferTurn(db, job.id, how.wait === "reddit-limit")];
}

export async function redditClosed(
  ports: Readonly<Pick<JobPorts, "db" | "jobs">>,
  job: Readonly<Pick<JobRow, "id">>,
  closed: boolean,
): Promise<void> {
  const now = Date.now();

  if (!closed)
    await ports.db.batch([wakeOldest(ports.db, job.id, now), releaseTurn(ports.db, job.id)]);

  await enqueueWaiting(ports, now, "oldest");
}

export function releaseWaiting(db: Database, now: number, also?: SQL): BatchItem<"sqlite"> {
  return db.update(jobs).set({ nextAttemptAt: now }).where(and(WAITING, also));
}

export async function enqueueWaiting(
  ports: Readonly<Pick<JobPorts, "db" | "jobs">>,
  now: number,
  which: "oldest" | "all",
): Promise<void> {
  const due = ports.db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(WAITING, lte(jobs.nextAttemptAt, now)))
    .orderBy(asc(jobs.id));

  const rows = await (which === "oldest" ? due.limit(1) : due);

  await enqueueQuietly(
    ports,
    rows.map(({ id }) => id),
    0,
  );
}
