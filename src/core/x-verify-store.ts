import { type SQLWrapper, and, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Database } from "./database.ts";
import { guardHolds } from "./guards.ts";
import type { JobWrites, SettledOutcome } from "./job-outcome.ts";
import { isLastAttempt, retryDelayMs } from "./job-retry.ts";
import { opening } from "./job-rows.ts";
import type { XReadNote } from "./kinds.ts";
import { items, jobs, xVerifications } from "./schema.ts";
import { withdrawnFetch } from "./settle.ts";
import type { Judged } from "./x-verdict.ts";
import { startingJudged } from "./x-verify-state.ts";
import type { XThreadValue } from "./x-wire.ts";

export function reopened(db: Database, itemId: number, address: string) {
  const now = Date.now();

  return [
    opening(db, { kind: "x_verify", address, now, where: eq(items.id, itemId) }),
    db
      .update(jobs)
      .set({ attempts: 0, nextAttemptAt: now, waitReason: null })
      .where(and(eq(jobs.itemId, itemId), eq(jobs.kind, "x_verify"), eq(jobs.state, "queued"))),
  ] as const;
}

export function queuedVerification(
  db: Database,
  {
    itemId,
    address,
    thread,
    digest,
    cliAttempts = null,
  }: Readonly<{
    itemId: number;
    address: string;
    thread: Readonly<XThreadValue>;
    digest: string | null;
    cliAttempts?: number | null;
  }>,
): readonly [JobWrites[number], ...JobWrites] {
  const fresh = {
    thread: JSON.stringify(thread),
    digest,
    cliAttempts,
    judged: startingJudged(thread),
  };

  return [
    db
      .insert(xVerifications)
      .values({ itemId, revision: 0, ...fresh })
      .onConflictDoUpdate({
        target: xVerifications.itemId,
        set: { revision: sql`${xVerifications.revision} + 1`, ...fresh },
      }),
    ...reopened(db, itemId, address),
  ];
}

export function revisionHolds(itemId: number, revision: number | null) {
  return sql`exists (select 1 from ${xVerifications} where ${xVerifications.itemId} = ${itemId} and ${xVerifications.revision} is ${revision})`;
}

export function savedProgress(
  db: Database,
  itemId: number,
  revision: number,
  judged: Judged,
  thread: Readonly<XThreadValue>,
): BatchItem<"sqlite"> {
  return db
    .update(xVerifications)
    .set({ judged, thread: JSON.stringify(thread) })
    .where(and(eq(xVerifications.itemId, itemId), eq(xVerifications.revision, revision)));
}

function forgotten(db: Database, itemId: number, revision: number | null): BatchItem<"sqlite"> {
  return db
    .delete(xVerifications)
    .where(and(eq(xVerifications.itemId, itemId), sql`${xVerifications.revision} is ${revision}`));
}

export type WithdrawnNote = XReadNote | null;

export function unreadableWrites(
  db: Database,
  itemId: number,
  revision: number | null,
  xNote: WithdrawnNote,
): JobWrites {
  return [withdrawnFetch(db, itemId, "unreadable", xNote), forgotten(db, itemId, revision)];
}

export function afterRefusedRoot(
  db: Database,
  { itemId, address }: Readonly<{ itemId: number; address: string }>,
  { revision, cliAttempts }: Readonly<{ revision: number; cliAttempts: number | null }>,
): JobWrites {
  if (cliAttempts === null || isLastAttempt(cliAttempts))
    return unreadableWrites(db, itemId, revision, "x-unconfirmed");

  return [
    forgotten(db, itemId, revision),
    opening(db, {
      kind: "fetch",
      address,
      where: eq(items.id, itemId),
      now: Date.now() + (retryDelayMs(cliAttempts) ?? 0),
      attempts: cliAttempts + 1,
      waitReason: "x-reread",
    }),
  ];
}

export function guarded(
  db: Database,
  address: Readonly<{ itemId: number; revision: number }>,
  outcome: Readonly<SettledOutcome>,
  unchanged: Readonly<SQLWrapper>,
  rebuilt: () => Promise<SettledOutcome>,
): SettledOutcome {
  const { precondition } = outcome;

  return {
    ...outcome,
    writes: [...outcome.writes, forgotten(db, address.itemId, address.revision)],
    precondition: {
      holds: sql`${unchanged} and ${precondition?.holds ?? sql`1`}`,
      rebuild: async () =>
        precondition !== undefined && (await guardHolds(db, unchanged))
          ? guarded(db, address, await precondition.rebuild(), unchanged, rebuilt)
          : rebuilt(),
    },
  };
}
