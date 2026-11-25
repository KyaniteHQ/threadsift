import { type SQL, and, eq, exists, isNull, lte, or, sql } from "drizzle-orm";

import { REDDIT_WAIT } from "../../../core/contract/job-contract.ts";
import {
  RATE_LIMITED,
  type RedditAnswer,
  leftOf,
  millisecondsOf,
} from "../../../core/contract/reddit-http.ts";
import type { Database } from "../../../core/kernel/database.ts";
import type { JobPorts } from "../../../core/kernel/job-outcome.ts";
import { enqueueWoken, wakeWaitingFetches, wokenJobs } from "../../../core/kernel/job-waiting.ts";
import {
  ACCOUNT_ROW,
  type AccountRow,
  redditAccount,
} from "../../../core/kernel/reddit-account-tables.ts";
import { retryAfterMs } from "../../../core/kernel/retry-after.ts";
import { WAITING, WAIT_CHECK_MS, accountIdle } from "./reddit-account-queue.ts";

const REFUSALS_TO_EXPIRE = 3;

const NO_THREADS = "[]";

const MAX_LIMIT_MS = 3_600_000;

const LIMIT_FLOOR_MS = 60_000;

export function limitedUntilOf(
  { reset, retryAfter }: Readonly<{ reset: string | null; retryAfter: string | null }>,
  now: number,
): number {
  const wait = Math.max(
    millisecondsOf(reset) ?? 0,
    retryAfterMs(retryAfter, now) ?? 0,
    LIMIT_FLOOR_MS,
  );

  return now + Math.min(wait, MAX_LIMIT_MS);
}

function usableResetMs(reset: string | null): number | null {
  const wait = millisecondsOf(reset);

  return wait === null || wait <= 0 ? null : wait;
}

export function resetAtOf(reset: string | null, now: number): number {
  return now + Math.min(usableResetMs(reset) ?? WAIT_CHECK_MS, WAIT_CHECK_MS);
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

function windowResetOf(resetMs: number | null, emptied: boolean, now: number) {
  if (resetMs !== null) return now + Math.min(resetMs, MAX_LIMIT_MS);

  return emptied
    ? sql`case when ${redditAccount.windowResetsAt} > ${now} then ${redditAccount.windowResetsAt} else ${now + WAIT_CHECK_MS} end`
    : undefined;
}

export async function recordWindow(
  db: Database,
  session: AccountSession,
  { left, reset, retryAfter, limited }: Readonly<WindowRecord>,
  now: number,
): Promise<void> {
  const windowRemaining = limited ? 0 : left === null ? undefined : Math.floor(left);

  await db
    .update(redditAccount)
    .set({
      lastRequestAt: now,
      windowRemaining,
      limitedUntil: limited ? limitedUntilOf({ reset, retryAfter }, now) : undefined,
      windowResetsAt: windowResetOf(usableResetMs(reset), !limited && windowRemaining === 0, now),
    })
    .where(ofSession(session));
}

export async function connectAccount(
  ports: Readonly<Pick<JobPorts, "db" | "jobs">>,
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

  await wakeWaitingFetches(ports, REDDIT_WAIT, {
    writes: [
      ports.db
        .insert(redditAccount)
        .values({ id: ACCOUNT_ROW, ...fresh })
        .onConflictDoUpdate({ target: redditAccount.id, set: fresh }),
    ],
    when: accountIdle(now),
    now,
  });
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

function expiredSession(db: Database, session: AccountSession): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(redditAccount)
      .where(and(ofSession(session), eq(redditAccount.state, "expired"))),
  );
}

export async function expireAccount(
  ports: Readonly<Pick<JobPorts, "db" | "jobs">>,
  session: AccountSession,
  now: number,
): Promise<void> {
  await wakeWaitingFetches(ports, REDDIT_WAIT, {
    writes: [
      ports.db
        .update(redditAccount)
        .set({ state: "expired", stateAt: now })
        .where(and(ofSession(session), eq(redditAccount.state, "connected"))),
    ],
    when: expiredSession(ports.db, session),
    now,
  });
}

export async function disconnectAccount(
  ports: Readonly<Pick<JobPorts, "db" | "jobs">>,
  now: number,
): Promise<void> {
  await wakeWaitingFetches(ports, REDDIT_WAIT, {
    writes: [ports.db.delete(redditAccount).where(eq(redditAccount.id, ACCOUNT_ROW))],
    now,
  });
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
    wokenJobs(ports.db, now, WAITING, expiredSession(ports.db, session)),
  ]);

  if (counted === undefined) return "ignored";

  if (counted.state !== "expired") return "counted";

  await enqueueWoken(ports, now, WAITING, "all");

  return "expired";
}
