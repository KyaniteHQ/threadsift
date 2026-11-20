import { type SQLWrapper, and, eq, exists, isNull, not, or, sql } from "drizzle-orm";

import type { Database } from "./database.ts";
import { hasDigestSource } from "./digest-source.ts";
import { hasDigest } from "./digest-stored.ts";
import { hasOpenJob } from "./job-rows.ts";
import { providerSet } from "./provider-saved.ts";
import { type JobRow, items } from "./schema.ts";

function setMarker(
  db: Database,
  itemId: number | Readonly<SQLWrapper>,
  failed: boolean,
  condition: Readonly<SQLWrapper>,
) {
  return db
    .update(items)
    .set({ digestFailed: failed })
    .where(and(eq(items.id, itemId), sql`${condition}`));
}

function whileDigestOpen() {
  return exists(hasOpenJob("digest"));
}

export function markDigest(
  db: Database,
  itemId: number | Readonly<SQLWrapper>,
  mark: "cleared" | "attempt-failed",
) {
  return setMarker(db, itemId, mark === "attempt-failed", whileDigestOpen());
}

export function markAttemptsSpent(
  db: Database,
  job: Readonly<Pick<JobRow, "itemId" | "attemptPending">>,
) {
  const closingOpensNoJob = or(
    isNull(items.pendingDigest),
    not(hasDigestSource()),
    sql`${items.pendingDigest} is ${job.attemptPending}`,
  );

  return setMarker(
    db,
    sql`${job.itemId}`,
    true,
    and(whileDigestOpen(), closingOpensNoJob) ?? sql`0`,
  );
}

export function keptNotUpdated(
  db: Database,
  itemId: number | Readonly<SQLWrapper>,
  when: Readonly<SQLWrapper> = sql`1`,
) {
  const kept = hasDigest(items.id);

  return [
    markDigest(db, itemId, "cleared"),
    setMarker(db, itemId, true, and(kept, sql`${when}`) ?? sql`0`),
  ] as const;
}

export function unusableInput(db: Database, itemId: number) {
  return [
    ...keptNotUpdated(db, itemId),
    setMarker(db, itemId, true, and(whileDigestOpen(), providerSet()) ?? sql`0`),
  ] as const;
}
