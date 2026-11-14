import { and, eq, exists, or, sql } from "drizzle-orm";

import type { JobPorts } from "./job-outcome.ts";
import type { Database } from "./ports.ts";
import {
  WAIT_CHECK_MS,
  enqueueWaiting,
  releaseWaiting,
  releaseWaitingWhen,
} from "./reddit-account-queue.ts";
import { type AccountRow, redditAccount } from "./reddit-account-tables.ts";
import { millisecondsOf } from "./reddit-window.ts";

export const REFUSALS_TO_EXPIRE = 3;

const MAX_LIMIT_MS = 3_600_000;

const LIMIT_FLOOR_MS = 60_000;

const ACCOUNT_ROW = 1;

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

export function stillConnected(db: Database, session: AccountSession): Promise<boolean> {
  return db
    .select({ id: redditAccount.id })
    .from(redditAccount)
    .where(and(ofSession(session), eq(redditAccount.state, "connected")))
    .then((rows) => rows.length === 1);
}

export interface WindowRecord {
  readonly left: number | null;
  readonly reset: string | null;
  readonly retryAfter: string | null;
  readonly limited: boolean;
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
    refusedJob: null,
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
      refusedJob: null,
    })
    .where(
      and(
        ofSession(session),
        or(eq(redditAccount.state, "expired"), sql`${redditAccount.refusedCount} > 0`),
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
    releaseWaitingWhen(
      ports.db,
      now,
      exists(
        ports.db
          .select({ one: sql`1` })
          .from(redditAccount)
          .where(and(ofSession(session), eq(redditAccount.state, "expired"))),
      ),
    ),
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

export async function clearRefusals(db: Database, session: AccountSession): Promise<void> {
  await db
    .update(redditAccount)
    .set({ refusedCount: 0, refusedJob: null })
    .where(and(ofSession(session), sql`${redditAccount.refusedCount} > 0`));
}

export async function countRefusal(
  ports: Readonly<Pick<JobPorts, "db" | "jobs">>,
  session: AccountSession,
  jobId: number,
  now: number,
): Promise<"counted" | "expired"> {
  const [counted] = await ports.db
    .update(redditAccount)
    .set({
      refusedCount: sql`case when ${redditAccount.refusedJob} = ${jobId} then ${redditAccount.refusedCount} else ${redditAccount.refusedCount} + 1 end`,
      refusedJob: jobId,
    })
    .where(and(ofSession(session), eq(redditAccount.state, "connected")))
    .returning({ count: redditAccount.refusedCount });

  if (counted === undefined || counted.count < REFUSALS_TO_EXPIRE) return "counted";

  await expireAccount(ports, session, now);

  return "expired";
}
