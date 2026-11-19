import {
  type SQLWrapper,
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  not,
  notExists,
  or,
  sql,
} from "drizzle-orm";

import { expireAiTasks } from "./ai-task-rows.ts";
import { refusedAs } from "./ai-task-state.ts";
import type { Database } from "./database.ts";
import { hasDigestSource, keptNotUpdated } from "./digest-source.ts";
import { NOT_FAILED } from "./item-status.ts";
import { hasOpenJob, opening } from "./job-rows.ts";
import { grokBotChosen, providerSet } from "./provider-saved.ts";
import { type JobRow, aiTasks, digests, items } from "./schema.ts";

const OWED_DIGESTS_PER_SWEEP = 20;

function eligibleDigest(scope: Readonly<SQLWrapper>) {
  return and(sql`${scope}`, hasDigestSource(), notExists(hasOpenJob("digest"))) ?? sql`0`;
}

export function openingDigest(
  db: Database,
  {
    scope,
    address,
    now,
  }: Readonly<{ scope: Readonly<SQLWrapper>; address: string | Readonly<SQLWrapper>; now: number }>,
) {
  return opening(db, { kind: "digest", address, now, where: eligibleDigest(scope) });
}

export function owedDigest(db: Database, job: Readonly<Pick<JobRow, "itemId" | "attemptPending">>) {
  return openingDigest(db, {
    scope:
      and(
        eq(items.id, sql`${job.itemId}`),
        isNotNull(items.pendingDigest),
        sql`${items.pendingDigest} is not ${job.attemptPending}`,
      ) ?? sql`0`,
    address: items.originalUrl,
    now: Date.now(),
  });
}

export async function sweepDigests(db: Database, now: number): Promise<void> {
  await expireAiTasks(db, now);
  await db.batch(
    owedDigests(db, {
      provider: grokBotChosen(),
      limit: OWED_DIGESTS_PER_SWEEP,
      retried: sql`0`,
    }),
  );
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
    }),
    ...keptNotUpdated(
      db,
      job.itemId,
      or(sql`not (${configured})`, not(hasDigestSource())) ?? sql`0`,
    ),
  ];
}

function lastDigestRefusedKey() {
  return sql`exists (select 1 from ${aiTasks} where ${aiTasks.itemId} = ${items.id} and ${aiTasks.kind} = 'digest' and ${refusedAs("wrong-key")} and ${aiTasks.id} = (select max(latest.id) from ${aiTasks} as latest where latest.item_id = ${items.id} and latest.kind = 'digest'))`;
}

function owedDigests(
  db: Database,
  {
    provider,
    limit,
    retried,
  }: Readonly<{
    provider: Readonly<SQLWrapper>;
    limit: number | undefined;
    retried: Readonly<SQLWrapper>;
  }>,
) {
  const withoutDigest =
    and(
      sql`${provider}`,
      NOT_FAILED,
      or(eq(items.digestFailed, false), sql`${retried}`),
      notExists(
        db.select({ id: digests.itemId }).from(digests).where(eq(digests.itemId, items.id)),
      ),
    ) ?? sql`0`;

  return [
    openingDigest(db, {
      scope:
        limit === undefined
          ? withoutDigest
          : inArray(
              items.id,
              db
                .select({ id: items.id })
                .from(items)
                .where(eligibleDigest(withoutDigest))
                .orderBy(asc(items.id))
                .limit(limit),
            ),
      address: sql`${items.originalUrl}`,
      now: Date.now(),
    }),
  ] as const;
}

export function olderDigests(db: Database) {
  return owedDigests(db, {
    provider: providerSet(),
    limit: undefined,
    retried: lastDigestRefusedKey(),
  });
}
