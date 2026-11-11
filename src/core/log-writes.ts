import { type SQL, eq, sql } from "drizzle-orm";

import type { LogAction } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { digests, logEntries, topics } from "./schema.ts";

interface Row {
  readonly action: SQL<LogAction>;
  readonly title?: SQL;
  readonly topic?: SQL;
  readonly tags?: SQL;
  readonly added?: number;
  readonly removed?: number;
  readonly picks?: number;
  readonly itemId?: number;
  readonly topicId?: SQL;
}

const NULL = sql<null>`null`;

const named = (action: LogAction): SQL<LogAction> => sql<LogAction>`${action}`;

const bound = (value: number | undefined): SQL => (value === undefined ? NULL : sql`${value}`);

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a Drizzle SQL value holds mutable chunks, so a row of them cannot be deeply readonly.
function entryFields(row: Readonly<Row>) {
  return {
    id: NULL.as("id"),
    at: sql<number>`${Date.now()}`.as("at"),
    action: row.action.as("action"),
    title: (row.title ?? NULL).as("title"),
    topic: (row.topic ?? NULL).as("topic"),
    tags: (row.tags ?? NULL).as("tags"),
    added: bound(row.added).as("added"),
    removed: bound(row.removed).as("removed"),
    picks: bound(row.picks).as("picks"),
    itemId: bound(row.itemId).as("item_id"),
    topicId: (row.topicId ?? NULL).as("topic_id"),
  };
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
  const tagNames = sql`(select json_group_array(tags.name order by wanted.key) from json_each(${tagKeys}) as wanted join tags on tags.key = wanted.value)`;

  const action = sql<LogAction>`case when exists (select 1 from ${digests} where ${digests.itemId} = ${itemId}) then 'digest' else 'ingest' end`;

  return db.insert(logEntries).select(
    db
      .select(
        entryFields({
          action,
          title: sql`${title}`,
          topic: sql`${topics.name}`,
          tags: tagNames,
          itemId,
          topicId: sql`${topics.id}`,
        }),
      )
      .from(topics)
      .where(eq(topics.key, topicKey)),
  );
}

export function loggedTopic(db: Database, topicKey: string) {
  return db.insert(logEntries).select(
    db
      .select(
        entryFields({
          action: named("topic"),
          topic: sql`${topics.name}`,
          topicId: sql`${topics.id}`,
        }),
      )
      .from(topics)
      .where(sql`${topics.key} = ${topicKey} and changes() > 0`),
  );
}

export function loggedOverview(
  db: Database,
  topicId: number,
  { added, removed }: Readonly<{ added: number; removed: number }>,
) {
  return db.insert(logEntries).select(
    db
      .select(
        entryFields({
          action: named("overview"),
          topic: sql`${topics.name}`,
          added,
          removed,
          topicId: sql`${topics.id}`,
        }),
      )
      .from(topics)
      .where(eq(topics.id, topicId)),
  );
}

export function loggedRelated(db: Database, itemId: number, picks: number) {
  return db.insert(logEntries).select(
    db
      .select(
        entryFields({ action: named("related"), title: sql`${digests.title}`, picks, itemId }),
      )
      .from(digests)
      .where(eq(digests.itemId, itemId)),
  );
}
