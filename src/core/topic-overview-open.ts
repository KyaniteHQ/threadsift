import { type SQLWrapper, and, eq, isNotNull, sql } from "drizzle-orm";

import { providerSet } from "./ai-tasks.ts";
import { opening } from "./job-rows.ts";
import type { Database } from "./ports.ts";
import { items, topicLeases, topicPages } from "./schema.ts";
import { coverageGaps } from "./topic-coverage.ts";
import { type TopicLease, leaseMatches } from "./topic-lease.ts";
import type { OverviewFailure } from "./topic-overview-contract.ts";

export function openingOverview(db: Database, itemId: number) {
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

function failureOf(db: Database, leased: Readonly<SQLWrapper>, failure: OverviewFailure) {
  return db
    .insert(topicPages)
    .select(
      db
        .select({
          topicId: sql<number>`${topicLeases.topicId}`.as("topic_id"),
          overview: sql<null>`null`.as("overview"),
          revision: sql<number>`0`.as("revision"),
          builtFrom: sql<string>`'[]'`.as("built_from"),
          failure: sql<OverviewFailure>`${failure}`.as("failure"),
          updatedAt: sql<number>`${Date.now()}`.as("updated_at"),
        })
        .from(topicLeases)
        .where(sql`${leased}`),
    )
    .onConflictDoUpdate({ target: topicPages.topicId, set: { failure } });
}

export function markOverviewFailed(
  db: Database,
  lease: Readonly<TopicLease>,
  failure: OverviewFailure,
) {
  return failureOf(db, leaseMatches(lease), failure);
}

export function markHolderOverviewFailed(db: Database, holder: string, failure: OverviewFailure) {
  return failureOf(db, eq(topicLeases.holder, holder), failure);
}
