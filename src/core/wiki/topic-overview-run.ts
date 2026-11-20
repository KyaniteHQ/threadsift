import { type SQL, type SQLWrapper, and, eq, isNotNull, sql } from "drizzle-orm";
import type { SubqueryWithSelection } from "drizzle-orm/sqlite-core";

import type { BuiltFrom, OverviewFailure } from "../contract/topic-overview-contract.ts";
import type { Database } from "../kernel/database.ts";
import type { ClaimedJob } from "../kernel/job-outcome.ts";
import { jobIsOpen, opening } from "../kernel/job-rows.ts";
import { providerSet } from "../kernel/provider-saved.ts";
import { aiTasks, items, topicPages, topics } from "../kernel/schema.ts";
import { coverageGaps } from "./topic-coverage.ts";
import { overviewContextField } from "./topic-overview-context.ts";

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
  return db
    .update(topicPages)
    .set({ failure: null })
    .where(and(eq(topicPages.topicId, topicId), jobIsOpen(jobId)));
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

export function overviewRefused(db: Database, topicId: number, failure: OverviewFailure) {
  const failing = db
    .select({ topicId: sql<number>`${topics.id}`.as("topic_id") })
    .from(topics)
    .where(eq(topics.id, topicId))
    .as("failing");

  return failed(db, failing, failure);
}

function ownedByJob(jobId: number) {
  return sql`exists (select 1 from ${aiTasks} where ${aiTasks.jobId} = ${jobId})`;
}

export function overviewGaveUp(
  db: Database,
  { id, itemId }: Readonly<Pick<ClaimedJob, "id" | "itemId">>,
) {
  const owned = db
    .select({ topicId: sql<number>`${items.topicId}`.as("topic_id") })
    .from(items)
    .where(and(eq(items.id, itemId), isNotNull(items.topicId), sql`not ${ownedByJob(id)}`))
    .as("failing");

  return [failed(db, owned, "gave-up"), markTopicOverviewFailed(db, id, "gave-up")];
}

function markTopicOverviewFailed(db: Database, jobId: number, failure: OverviewFailure) {
  const sent = db
    .select({ topicId: sql<number>`${topics.id}`.as("topic_id") })
    .from(aiTasks)
    .innerJoin(topics, sql`${topics.id} = ${overviewContextField("topicId")}`)
    .where(
      sql`${aiTasks.id} = (select max(latest.id) from ${aiTasks} as latest where latest.job_id = ${jobId} and latest.kind = 'topic_overview') and not exists (select 1 from ${topicPages} where ${topicPages.topicId} = ${topics.id} and ${topicPages.revision} > ${overviewContextField("revision")})`,
    )
    .as("failing");

  return failed(db, sent, failure);
}
