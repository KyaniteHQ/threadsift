import { and, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { statusColumns } from "./item-status.ts";
import type { JobWrites } from "./job-outcome.ts";
import { opening } from "./job-rows.ts";
import type { Database } from "./ports.ts";
import { items, jobs, xVerifications } from "./schema.ts";
import { type Judged, startingJudged } from "./x-verify-state.ts";
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
  }: Readonly<{
    itemId: number;
    address: string;
    thread: Readonly<XThreadValue>;
    digest: string | null;
  }>,
): JobWrites {
  const fresh = {
    thread: JSON.stringify(thread),
    digest,
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
): BatchItem<"sqlite"> {
  return db
    .update(xVerifications)
    .set({ judged })
    .where(and(eq(xVerifications.itemId, itemId), eq(xVerifications.revision, revision)));
}

export function forgotten(
  db: Database,
  itemId: number,
  revision: number | null,
): BatchItem<"sqlite"> {
  return db
    .delete(xVerifications)
    .where(and(eq(xVerifications.itemId, itemId), sql`${xVerifications.revision} is ${revision}`));
}

export function unreadableWrites(db: Database, itemId: number, revision: number | null): JobWrites {
  return [
    db
      .update(items)
      .set({ fetch: "unreadable", ...statusColumns({ kind: "settled" }), pendingDigest: null })
      .where(eq(items.id, itemId)),
    forgotten(db, itemId, revision),
  ];
}
