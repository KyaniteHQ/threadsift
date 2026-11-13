import { type SQLWrapper, and, count, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { providerSet } from "./ai-tasks.ts";
import { opening } from "./job-rows.ts";
import type { Database } from "./ports.ts";
import { type JobRow, digests, items, topicLeases, topicPages } from "./schema.ts";
import { coverageGaps, hasOpenOverview, notBuiltFrom } from "./topic-coverage.ts";
import { type TopicLease, leaseMatches, recoverHolderLeases } from "./topic-lease.ts";
import {
  type BuiltFrom,
  type Overview,
  type OverviewFailure,
  citedIds,
} from "./topic-overview-contract.ts";

export type OverviewRun =
  | { readonly kind: "idle" }
  | { readonly kind: "pending" }
  | { readonly kind: "failed"; readonly reason: OverviewFailure };

export function overviewRun({
  open,
  failure,
}: Readonly<{ open: boolean; failure: OverviewFailure | null }>): OverviewRun {
  if (open) return { kind: "pending" };

  return failure === null ? { kind: "idle" } : { kind: "failed", reason: failure };
}

export function overviewHolder(jobId: number): string {
  return `topic_overview:${String(jobId)}`;
}

export function openingOverview(db: Database, itemId: number | Readonly<SQLWrapper>) {
  return opening(db, {
    kind: "topic_overview",
    address: sql`${items.originalUrl}`,
    now: Date.now(),
    where: and(eq(items.id, itemId), isNotNull(items.topicId), providerSet()) ?? sql`0`,
  });
}

export function continuingOverview(db: Database, topicId: number, when: Readonly<SQLWrapper>) {
  return opening(db, {
    kind: "topic_overview",
    address: sql`${items.originalUrl}`,
    now: Date.now(),
    where:
      and(
        sql`${items.id} = (select min(member.id) from ${items} as member where member.topic_id = ${topicId})`,
        providerSet(),
        coverageGaps(topicId),
        when,
      ) ?? sql`0`,
  });
}

export function overviewOpened(db: Database, topicId: number) {
  return db.update(topicPages).set({ failure: null }).where(eq(topicPages.topicId, topicId));
}

export function overviewRetried(db: Database, topicId: number) {
  return db
    .update(topicPages)
    .set({ failure: null })
    .where(and(eq(topicPages.topicId, topicId), sql`${hasOpenOverview(topicId)}`));
}

export function overviewStored(
  db: Database,
  page: Readonly<{
    topicId: number;
    overview: string | null;
    revision: number;
    builtFrom: BuiltFrom;
  }>,
) {
  const stored = { ...page, failure: null, updatedAt: Date.now() };

  return db
    .insert(topicPages)
    .values(stored)
    .onConflictDoUpdate({ target: topicPages.topicId, set: stored });
}

export function overviewRemoved(db: Database, topicId: number, when: Readonly<SQLWrapper>) {
  return db.delete(topicPages).where(and(eq(topicPages.topicId, topicId), sql`${when}`));
}

function failed(db: Database, topics: Readonly<SQLWrapper>, failure: OverviewFailure) {
  return db
    .insert(topicPages)
    .select(
      db
        .select({
          topicId: sql<number>`failing.topic_id`.as("topic_id"),
          overview: sql<null>`null`.as("overview"),
          revision: sql<number>`0`.as("revision"),
          builtFrom: sql<string>`'[]'`.as("built_from"),
          failure: sql<OverviewFailure>`${failure}`.as("failure"),
          updatedAt: sql<number>`${Date.now()}`.as("updated_at"),
        })
        .from(sql`(${topics}) as failing`)
        .where(sql`1`),
    )
    .onConflictDoUpdate({ target: topicPages.topicId, set: { failure } });
}

export function overviewRefused(
  db: Database,
  lease: Readonly<TopicLease>,
  failure: OverviewFailure,
) {
  return failed(
    db,
    sql`select ${topicLeases.topicId} as topic_id from ${topicLeases} where ${leaseMatches(lease)}`,
    failure,
  );
}

export function overviewGaveUp(
  db: Database,
  { id, itemId }: Readonly<Pick<JobRow, "id" | "itemId">>,
) {
  return [
    failed(
      db,
      sql`select ${items.topicId} as topic_id from ${items} where ${items.id} = ${itemId} and ${isNotNull(items.topicId)}`,
      "gave-up",
    ),
    recoverHolderLeases(db, overviewHolder(id)),
  ];
}

function overviewReads(db: Database, topicId: number) {
  return db.batch([
    db
      .select({
        overview: topicPages.overview,
        builtFrom: topicPages.builtFrom,
        failure: topicPages.failure,
      })
      .from(topicPages)
      .where(eq(topicPages.topicId, topicId)),
    db
      .select({
        total: count(),
        built: sql<number>`coalesce(sum(case when not (${notBuiltFrom(topicId, sql`${items.id}`, sql`${digests.taskId}`)}) then 1 else 0 end), 0)`,
      })
      .from(items)
      .innerJoin(digests, eq(digests.itemId, items.id))
      .where(eq(items.topicId, topicId)),
    db
      .select({
        pending: sql<number>`${hasOpenOverview(topicId)}`,
        provider: sql<number>`${providerSet()}`,
      })
      .from(sql`(select 1)`),
  ]);
}

interface Cited {
  readonly id: number;
  readonly title: string;
}

function citedTitles(db: Database, topicId: number, text: string | null): Promise<Cited[]> {
  const ids = text === null ? [] : citedIds(text);

  if (ids.length === 0) return Promise.resolve([]);

  return db
    .select({ id: items.id, title: digests.title })
    .from(items)
    .innerJoin(digests, eq(digests.itemId, items.id))
    .where(and(eq(items.topicId, topicId), inArray(items.id, ids)));
}

export interface TopicOverviewRead {
  readonly overview: Overview;
  readonly total: number;
  readonly builtFrom: BuiltFrom;
}

export async function readTopicOverview(db: Database, topicId: number): Promise<TopicOverviewRead> {
  const [[page], [counts], [flags]] = await overviewReads(db, topicId);
  const failure = page?.failure ?? null;
  const cited = await citedTitles(db, topicId, page?.overview ?? null);

  return {
    total: counts?.total ?? 0,
    builtFrom: page?.builtFrom ?? [],
    overview: {
      state: overviewRun({ open: flags?.pending === 1, failure }).kind,
      text: page?.overview ?? null,
      cited,
      builtFrom: counts?.built ?? 0,
      provider: flags?.provider === 1,
      failure,
    },
  };
}
