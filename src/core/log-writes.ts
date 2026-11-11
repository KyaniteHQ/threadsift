import { type SQL, type SQLWrapper, eq, sql } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

import type { LogAction } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { digests, logEntries, topics } from "./schema.ts";

interface Fields {
  readonly action: SQL<LogAction> | LogAction;
  readonly title?: SQLWrapper | string;
  readonly topic?: SQLWrapper;
  readonly tags?: SQL;
  readonly added?: number;
  readonly removed?: number;
  readonly picks?: number;
  readonly itemId?: number;
  readonly topicId?: SQLWrapper;
}

function appended(
  db: Database,
  // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a Drizzle table and SQL value hold mutable chunks, so they cannot be deeply readonly.
  fields: Readonly<Fields & { from: SQLiteTable; where: SQL | undefined }>,
) {
  return db.insert(logEntries).select(
    db
      .select({
        id: sql<null>`null`.as("id"),
        at: sql<number>`${Date.now()}`.as("at"),
        action: sql`${fields.action}`.as("action"),
        title: sql`${fields.title ?? null}`.as("title"),
        topic: sql`${fields.topic ?? null}`.as("topic"),
        tags: sql`${fields.tags ?? null}`.as("tags"),
        added: sql`${fields.added ?? null}`.as("added"),
        removed: sql`${fields.removed ?? null}`.as("removed"),
        picks: sql`${fields.picks ?? null}`.as("picks"),
        itemId: sql`${fields.itemId ?? null}`.as("item_id"),
        topicId: sql`${fields.topicId ?? null}`.as("topic_id"),
      })
      .from(fields.from)
      .where(fields.where),
  );
}

export function loggedDigest(
  db: Database,
  {
    itemId,
    title,
    topicKey,
    tagKeys,
  }: Readonly<{ itemId: number; title: string; topicKey: string; tagKeys: string }>,
) {
  return appended(db, {
    from: topics,
    where: eq(topics.key, topicKey),
    action: sql<LogAction>`case when exists (select 1 from ${digests} where ${digests.itemId} = ${itemId}) then 'digest' else 'ingest' end`,
    title,
    topic: topics.name,
    tags: sql`(select json_group_array(tags.name order by wanted.key) from json_each(${tagKeys}) as wanted join tags on tags.key = wanted.value)`,
    itemId,
    topicId: topics.id,
  });
}

export function loggedTopic(db: Database, topicKey: string) {
  return appended(db, {
    from: topics,
    where: sql`${topics.key} = ${topicKey} and changes() > 0`,
    action: "topic",
    topic: topics.name,
    topicId: topics.id,
  });
}

export function loggedOverview(
  db: Database,
  topicId: number,
  { added, removed }: Readonly<{ added: number; removed: number }>,
) {
  return appended(db, {
    from: topics,
    where: eq(topics.id, topicId),
    action: "overview",
    topic: topics.name,
    added,
    removed,
    topicId: topics.id,
  });
}

export function loggedRelated(db: Database, itemId: number, picks: number) {
  return appended(db, {
    from: digests,
    where: eq(digests.itemId, itemId),
    action: "related",
    title: digests.title,
    picks,
    itemId,
  });
}
