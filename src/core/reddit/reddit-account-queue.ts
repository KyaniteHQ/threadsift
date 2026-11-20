import { type SQL, and, asc, eq, gte, isNull, lte, not, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { CLAIM_MARGIN_MS } from "../contract/job-contract.ts";
import { FILL_DEADLINE_MS } from "../contract/request-waits.ts";
import type { Database } from "../kernel/database.ts";
import type { Closing, JobPorts } from "../kernel/job-outcome.ts";
import { enqueueQuietly, holding, jobIsOpen } from "../kernel/job-rows.ts";
import { waitingFor, wokenJobs } from "../kernel/job-waiting.ts";
import { ACCOUNT_ROW, type AccountRow, redditAccount } from "../kernel/reddit-account-tables.ts";
import { type JobRow, jobs } from "../kernel/schema.ts";

export const WAIT_CHECK_MS = 300_000;

const WAITING = and(eq(jobs.kind, "fetch"), waitingFor("reddit-limit"));

const OLDEST_WAITING = sql`(select min(${jobs.id}) from ${jobs} where ${WAITING})`;

function turnIsFree(jobId: number, now: number): SQL | undefined {
  return and(
    eq(redditAccount.id, ACCOUNT_ROW),
    eq(redditAccount.state, "connected"),
    or(
      isNull(redditAccount.busyUntil),
      lte(redditAccount.busyUntil, now),
      eq(redditAccount.busyJob, jobId),
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

function queueAllows(jobId: number): SQL | undefined {
  return or(
    isNull(redditAccount.queueHead),
    gte(redditAccount.queueHead, jobId),
    not(jobIsOpen(redditAccount.queueHead)),
  );
}

export type TurnRun = Readonly<Pick<JobRow, "id" | "attempts" | "attemptGeneration">>;

function ownedBy(run: Readonly<Pick<TurnRun, "id" | "attempts">>): SQL | undefined {
  return and(eq(redditAccount.busyJob, run.id), eq(redditAccount.busyAttempt, run.attempts));
}

export async function holdsTurn(
  db: Database,
  run: TurnRun,
  { sealedSession }: Readonly<Pick<AccountRow, "sealedSession">>,
): Promise<boolean> {
  const rows = await db
    .select({ id: redditAccount.id })
    .from(redditAccount)
    .where(
      and(
        eq(redditAccount.id, ACCOUNT_ROW),
        eq(redditAccount.sealedSession, sealedSession),
        eq(redditAccount.state, "connected"),
        ownedBy(run),
        holding(run),
      ),
    );

  return rows.length === 1;
}

export async function takeTurn(
  db: Database,
  run: TurnRun,
  now: number,
): Promise<AccountRow | null> {
  const jobId = run.id;

  const [taken] = await db
    .update(redditAccount)
    .set({
      busyJob: jobId,
      busyAttempt: run.attempts,
      busyUntil: now + FILL_DEADLINE_MS + CLAIM_MARGIN_MS,
      queueHead: sql`(select min(${jobs.id}) from ${jobs} where ${WAITING} and ${jobs.id} <> ${jobId})`,
    })
    .where(and(turnIsFree(jobId, now), queueAllows(jobId), holding(run)))
    .returning();

  return taken ?? null;
}

export function resumeAt(row: Readonly<AccountRow>, now: number): number {
  const holds = [row.limitedUntil, row.windowRemaining === 0 ? row.windowResetsAt : null].filter(
    (until): until is number => until !== null && until > now,
  );

  return Math.min(now + WAIT_CHECK_MS, holds.length === 0 ? Infinity : Math.max(...holds));
}

function releaseTurn(db: Database, run: TurnRun): BatchItem<"sqlite"> {
  return db
    .update(redditAccount)
    .set({ busyJob: null, busyAttempt: null, busyUntil: null })
    .where(ownedBy(run));
}

function wakeOldest(db: Database, run: TurnRun, now: number): BatchItem<"sqlite"> {
  return wokenJobs(
    db,
    now,
    and(
      WAITING,
      eq(jobs.id, sql`${OLDEST_WAITING}`),
      sql`exists (select 1 from ${redditAccount} where ${ownedBy(run)})`,
    ),
  );
}

function deferTurn(db: Database, run: TurnRun, waits: boolean): BatchItem<"sqlite"> {
  const jobId = run.id;
  const headStays = sql`${redditAccount.queueHead} is not null and ${redditAccount.queueHead} < ${jobId} and ${jobIsOpen(redditAccount.queueHead)}`;
  const holds = sql`${ownedBy(run)}`;

  return db
    .update(redditAccount)
    .set({
      busyJob: sql`case when ${holds} then null else ${redditAccount.busyJob} end`,
      busyAttempt: sql`case when ${holds} then null else ${redditAccount.busyAttempt} end`,
      busyUntil: sql`case when ${holds} then null else ${redditAccount.busyUntil} end`,
      queueHead: waits
        ? sql`case when ${headStays} then ${redditAccount.queueHead} else min(${jobId}, coalesce(${OLDEST_WAITING}, ${jobId})) end`
        : redditAccount.queueHead,
    })
    .where(eq(redditAccount.id, ACCOUNT_ROW));
}

function wakeWhenFree(db: Database, run: TurnRun, now: number): BatchItem<"sqlite"> {
  const takeable = and(turnIsFree(run.id, now), queueAllows(run.id));

  return wokenJobs(
    db,
    now,
    and(
      eq(jobs.id, run.id),
      WAITING,
      sql`exists (select 1 from ${redditAccount} where ${takeable})`,
    ),
  );
}

export function redditClosing(
  db: Database,
  job: TurnRun,
  how: Closing,
): readonly BatchItem<"sqlite">[] {
  return how.kind === "closed"
    ? [wakeOldest(db, job, Date.now()), releaseTurn(db, job)]
    : how.wait === "reddit-limit"
      ? [deferTurn(db, job, true), wakeWhenFree(db, job, Date.now())]
      : [deferTurn(db, job, false)];
}

export async function redditClosed(
  ports: Readonly<Pick<JobPorts, "db" | "jobs">>,
  job: TurnRun,
  closed: boolean,
): Promise<void> {
  const now = Date.now();

  if (!closed) await ports.db.batch([wakeOldest(ports.db, job, now), releaseTurn(ports.db, job)]);

  await enqueueWaiting(ports, now, "oldest");
}

export function releaseWaiting(db: Database, now: number): BatchItem<"sqlite"> {
  return wokenJobs(db, now, WAITING);
}

export function releaseWaitingWhen(db: Database, now: number, condition: SQL): BatchItem<"sqlite"> {
  return wokenJobs(db, now, and(WAITING, condition));
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
