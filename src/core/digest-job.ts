import { type SQLWrapper, and, eq, isNotNull, not, notExists, or, sql } from "drizzle-orm";

import { expireAiTasks, providerSet } from "./ai-tasks.ts";
import { hasDigestSource, keptNotUpdated } from "./digest-source.ts";
import { NOT_FAILED, setStatus } from "./item-status.ts";
import { hasOpenJob, opening } from "./job-rows.ts";
import { linkOlderDigests } from "./older-digests.ts";
import type { Database } from "./ports.ts";
import { digests, items } from "./schema.ts";

export function openingDigest(
  db: Database,
  {
    scope,
    address,
    now,
  }: Readonly<{ scope: Readonly<SQLWrapper>; address: string | Readonly<SQLWrapper>; now: number }>,
) {
  const eligible = and(sql`${scope}`, hasDigestSource(), notExists(hasOpenJob("digest"))) ?? sql`0`;

  return { eligible, job: opening(db, { kind: "digest", address, now, where: eligible }) };
}

export async function sweepDigests(db: Database, now: number): Promise<void> {
  await expireAiTasks(db, now);
  await linkOlderDigests(db);
}

export function digestAfterFetch(
  db: Database,
  job: Readonly<{ itemId: number | Readonly<SQLWrapper>; address: string }>,
) {
  const configured = or(isNotNull(items.pendingDigest), providerSet()) ?? sql`0`;

  return [
    db
      .update(items)
      .set({ pendingDigest: null })
      .where(and(eq(items.id, job.itemId), not(hasDigestSource()))),
    openingDigest(db, {
      scope: and(eq(items.id, job.itemId), configured) ?? sql`0`,
      address: job.address,
      now: Date.now(),
    }).job,
    ...keptNotUpdated(
      db,
      job.itemId,
      or(sql`not (${configured})`, not(hasDigestSource())) ?? sql`0`,
    ),
  ];
}

export function olderDigests(db: Database) {
  const older = openingDigest(db, {
    scope:
      and(
        NOT_FAILED,
        eq(items.digestFailed, false),
        notExists(
          db.select({ id: digests.itemId }).from(digests).where(eq(digests.itemId, items.id)),
        ),
      ) ?? sql`0`,
    address: sql`${items.originalUrl}`,
    now: Date.now(),
  });

  return [setStatus(db, { kind: "queued" }, older.eligible), older.job];
}
