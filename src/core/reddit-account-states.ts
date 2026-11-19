import { and, eq, exists, isNull, lte, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Database } from "./database.ts";
import type { JobPorts } from "./job-outcome.ts";
import {
  WAIT_CHECK_MS,
  enqueueWaiting,
  releaseWaiting,
  releaseWaitingWhen,
} from "./reddit-account-queue.ts";
import { ACCOUNT_ROW, type AccountRow, redditAccount } from "./reddit-account-tables.ts";
import { RATE_LIMITED, type RedditAnswer, leftOf, millisecondsOf } from "./reddit-http.ts";

export const REFUSALS_TO_EXPIRE = 3;

const NO_THREADS = "[]";

const MAX_LIMIT_MS = 3_600_000;

const LIMIT_FLOOR_MS = 60_000;

export function limitedUntilOf(
  { reset, retryAfter }: Readonly<{ reset: string | null; retryAfter: string | null }>,
  now: number,
): number {
  const wait = Math.max(
    millisecondsOf(reset) ?? 0,
    millisecondsOf(retryAfter) ?? 0,
    LIMIT_FLOOR_MS,
  );

  return now + Math.min(wait, MAX_LIMIT_MS);
}

export function resetAtOf(reset: string | null, now: number): number {
  return now + Math.min(millisecondsOf(reset) ?? WAIT_CHECK_MS, WAIT_CHECK_MS);
}

export async function accountRow(db: Database): Promise<AccountRow | null> {
  const [row] = await db.select().from(redditAccount).where(eq(redditAccount.id, ACCOUNT_ROW));

  return row ?? null;
}

export type AccountSession = Readonly<Pick<AccountRow, "sealedSession">>;

function ofSession({ sealedSession }: AccountSession) {
  return and(eq(redditAccount.id, ACCOUNT_ROW), eq(redditAccount.sealedSession, sealedSession));
}

export interface WindowRecord {
  readonly left: number | null;
  readonly reset: string | null;
  readonly retryAfter: string | null;
  readonly limited: boolean;
}

export function windowRecordOf(answer: Readonly<RedditAnswer>): WindowRecord {
  return {
    left: leftOf(answer.remaining),
    reset: answer.reset,
    retryAfter: answer.retryAfter,
    limited: answer.status === RATE_LIMITED,
  };
}

export async function recordWindow(
  db: Database,
  session: AccountSession,
  { left, reset, retryAfter, limited }: Readonly<WindowRecord>,
  now: number,
): Promise<void> {
  const resetMs = millisecondsOf(reset);
  const changes: Partial<AccountRow> = { lastRequestAt: now };

  if (limited) {
    changes.windowRemaining = 0;
    changes.limitedUntil = limitedUntilOf({ reset, retryAfter }, now);
  } else if (left !== null) {
    changes.windowRemaining = Math.floor(left);
  }

  if (resetMs !== null) changes.windowResetsAt = now + resetMs;

  await db.update(redditAccount).set(changes).where(ofSession(session));
}

export async function connectAccount(
  db: Database,
  sealedSession: string,
  now: number,
): Promise<void> {
  const fresh = {
    sealedSession,
    state: "connected",
    stateAt: now,
    limitedUntil: null,
    windowRemaining: null,
    windowResetsAt: null,
    refusedCount: 0,
    refusedThreads: NO_THREADS,
    connectedAt: now,
  } as const;

  await db
    .insert(redditAccount)
    .values({ id: ACCOUNT_ROW, ...fresh })
    .onConflictDoUpdate({ target: redditAccount.id, set: fresh });
}

export async function confirmAccount(
  db: Database,
  session: AccountSession,
  now: number,
): Promise<void> {
  await db
    .update(redditAccount)
    .set({
      state: "connected",
      stateAt: sql`case when ${redditAccount.state} = 'expired' then ${now} else ${redditAccount.stateAt} end`,
      refusedCount: 0,
      refusedThreads: NO_THREADS,
      refusalsClearedAt: now,
    })
    .where(ofSession(session));
}

function releaseWhenExpired(
  db: Database,
  session: AccountSession,
  now: number,
): BatchItem<"sqlite"> {
  return releaseWaitingWhen(
    db,
    now,
    exists(
      db
        .select({ one: sql`1` })
        .from(redditAccount)
        .where(and(ofSession(session), eq(redditAccount.state, "expired"))),
    ),
  );
}

export async function expireAccount(
  ports: Readonly<Pick<JobPorts, "db" | "jobs">>,
  session: AccountSession,
  now: number,
): Promise<void> {
  await ports.db.batch([
    ports.db
      .update(redditAccount)
      .set({ state: "expired", stateAt: now })
      .where(and(ofSession(session), eq(redditAccount.state, "connected"))),
    releaseWhenExpired(ports.db, session, now),
  ]);

  await enqueueWaiting(ports, now, "all");
}

export async function disconnectAccount(
  ports: Readonly<Pick<JobPorts, "db" | "jobs">>,
  now: number,
): Promise<void> {
  await ports.db.batch([
    ports.db.delete(redditAccount).where(eq(redditAccount.id, ACCOUNT_ROW)),
    releaseWaiting(ports.db, now),
  ]);

  await enqueueWaiting(ports, now, "all");
}

export async function clearRefusals(
  db: Database,
  session: AccountSession,
  now: number,
): Promise<void> {
  await db
    .update(redditAccount)
    .set({ refusedCount: 0, refusedThreads: NO_THREADS, refusalsClearedAt: now })
    .where(ofSession(session));
}

export async function countRefusal(
  ports: Readonly<Pick<JobPorts, "db" | "jobs">>,
  session: AccountSession,
  { thread, startedAt }: Readonly<{ thread: string; startedAt: number }>,
  now: number,
): Promise<"counted" | "ignored" | "expired"> {
  const current = redditAccount.refusedThreads;

  const known = sql`exists (select 1 from json_each(${current}) where value = ${thread})`;

  const threads = sql`case when ${known} then ${current} else json_insert(${current}, '$[#]', ${thread}) end`;

  const count = sql`json_array_length(${threads})`;

  const [[counted]] = await ports.db.batch([
    ports.db
      .update(redditAccount)
      .set({
        refusedThreads: threads,
        refusedCount: count,
        state: sql`case when ${count} >= ${REFUSALS_TO_EXPIRE} then 'expired' else ${redditAccount.state} end`,
        stateAt: sql`case when ${count} >= ${REFUSALS_TO_EXPIRE} then ${now} else ${redditAccount.stateAt} end`,
      })
      .where(
        and(
          ofSession(session),
          eq(redditAccount.state, "connected"),
          or(
            isNull(redditAccount.refusalsClearedAt),
            lte(redditAccount.refusalsClearedAt, startedAt),
          ),
        ),
      )
      .returning({ state: redditAccount.state }),
    releaseWhenExpired(ports.db, session, now),
  ]);

  if (counted === undefined) return "ignored";

  if (counted.state !== "expired") return "counted";

  await enqueueWaiting(ports, now, "all");

  return "expired";
}
