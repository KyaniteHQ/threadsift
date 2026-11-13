import { type SQL, type SQLWrapper, and, eq, isNotNull, sql } from "drizzle-orm";
import type { SubqueryWithSelection } from "drizzle-orm/sqlite-core";

import { providerSet } from "./ai-tasks.ts";
import type { ClaimedJob } from "./job-outcome.ts";
import { opening } from "./job-rows.ts";
import type { Database } from "./ports.ts";
import { type JobRow, aiTasks, items, jobs, topicLeases, topicPages, topics } from "./schema.ts";
import { coverageGaps } from "./topic-coverage.ts";
import { type TopicLease, leaseMatches, recoverPrefixLeases } from "./topic-lease.ts";
import type { BuiltFrom, OverviewFailure } from "./topic-overview-contract.ts";

export function overviewHolderPrefix(jobId: number): string {
  return `topic_overview:${String(jobId)}:`;
}

export function overviewHolder({
  id,
  attempts,
  staleRequeues,
}: Readonly<Pick<ClaimedJob, "id" | "attempts" | "staleRequeues">>): string {
  return `${overviewHolderPrefix(id)}${String(attempts)}:${String(staleRequeues)}`;
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

export function overviewRetried(db: Database, topicId: number, jobId: number) {
  const stillOpen = sql`exists (select 1 from ${jobs} where ${jobs.id} = ${jobId} and ${jobs.state} <> 'done')`;

  return db
    .update(topicPages)
    .set({ failure: null })
    .where(and(eq(topicPages.topicId, topicId), stillOpen));
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

type TopicIds = SubqueryWithSelection<{ topicId: SQL.Aliased<number> }, "failing">;

function failed(db: Database, topicIds: TopicIds, failure: OverviewFailure) {
  return db
    .insert(topicPages)
    .select(
      db
        .select({
          topicId: topicIds.topicId,
          overview: sql<null>`null`.as("overview"),
          revision: sql<number>`0`.as("revision"),
          builtFrom: sql<string>`'[]'`.as("built_from"),
          failure: sql<OverviewFailure>`${failure}`.as("failure"),
          updatedAt: sql<number>`${Date.now()}`.as("updated_at"),
        })
        .from(topicIds)
        .where(sql`1`),
    )
    .onConflictDoUpdate({ target: topicPages.topicId, set: { failure } });
}

export function overviewRefused(
  db: Database,
  lease: Readonly<TopicLease>,
  failure: OverviewFailure,
) {
  const held = db
    .select({ topicId: sql<number>`${topicLeases.topicId}`.as("topic_id") })
    .from(topicLeases)
    .where(leaseMatches(lease))
    .as("failing");

  return failed(db, held, failure);
}

function ownedByJob(jobId: number) {
  return sql`exists (select 1 from ${aiTasks} where ${aiTasks.jobId} = ${jobId})`;
}

export function overviewGaveUp(
  db: Database,
  { id, itemId }: Readonly<Pick<JobRow, "id" | "itemId">>,
) {
  const owned = db
    .select({ topicId: sql<number>`${items.topicId}`.as("topic_id") })
    .from(items)
    .where(and(eq(items.id, itemId), isNotNull(items.topicId), sql`not ${ownedByJob(id)}`))
    .as("failing");

  return [
    failed(db, owned, "gave-up"),
    markTopicOverviewFailed(db, id, "gave-up"),
    recoverPrefixLeases(db, overviewHolderPrefix(id)),
  ];
}

function markTopicOverviewFailed(db: Database, jobId: number, failure: OverviewFailure) {
  const sent = db
    .select({ topicId: sql<number>`${topics.id}`.as("topic_id") })
    .from(aiTasks)
    .innerJoin(topics, sql`${topics.id} = json_extract(${aiTasks.context}, '$.topicId')`)
    .where(
      sql`${aiTasks.id} = (select max(latest.id) from ${aiTasks} as latest where latest.job_id = ${jobId} and latest.kind = 'topic_overview') and not exists (select 1 from ${topicPages} where ${topicPages.topicId} = ${topics.id} and ${topicPages.revision} > json_extract(${aiTasks.context}, '$.revision'))`,
    )
    .as("failing");

  return failed(db, sent, failure);
}
