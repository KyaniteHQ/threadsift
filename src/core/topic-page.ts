import { and, desc, eq, sql } from "drizzle-orm";

import { catalogKey } from "./catalog-key.ts";
import { type ItemCursor, ITEMS_PAGE_SIZE, formatCursor } from "./item-page.ts";
import { readDisagreements } from "./known-disagreements.ts";
import type { Database } from "./ports.ts";
import { digests, items, pins, topics } from "./schema.ts";
import type { TopicPage } from "./topic-overview-contract.ts";
import { readTopicOverview } from "./topic-overview-run.ts";
import { topicKeyOfSegment } from "./topic-path.ts";

export interface TopicRow {
  readonly id: number;
  readonly key: string;
  readonly name: string;
}

export async function topicOfKey(db: Database, text: string): Promise<TopicRow | null> {
  const key = catalogKey(topicKeyOfSegment(text));

  if (key === "") return null;

  const [topic] = await db
    .select({ id: topics.id, key: topics.key, name: topics.name })
    .from(topics)
    .where(eq(topics.key, key));

  if (topic !== undefined) return topic;

  const [merged] = await db
    .select({ id: topics.id, key: topics.key, name: topics.name })
    .from(pins)
    .innerJoin(topics, eq(topics.id, pins.intoTopicId))
    .where(and(eq(pins.kind, "topic-merge"), eq(pins.fromKey, key)));

  return merged ?? null;
}

function pageQuery(db: Database, topicId: number, cursor: Readonly<ItemCursor> | null) {
  const after =
    cursor === null
      ? undefined
      : sql`(${items.savedAt}, ${items.id}) < (${cursor.savedAt}, ${cursor.id})`;

  return db
    .select({
      id: items.id,
      source: items.source,
      savedAt: items.savedAt,
      readState: items.readState,
      title: digests.title,
      summary: sql<string>`json_extract(${digests.digest}, '$.summary')`,
      digest: digests.taskId,
    })
    .from(items)
    .innerJoin(digests, eq(digests.itemId, items.id))
    .where(and(eq(items.topicId, topicId), after))
    .orderBy(desc(items.savedAt), desc(items.id))
    .limit(ITEMS_PAGE_SIZE + 1);
}

export async function readTopicPage(
  db: Database,
  keyText: string,
  cursor: Readonly<ItemCursor> | null,
): Promise<TopicPage | undefined> {
  const topic = await topicOfKey(db, keyText);

  if (topic === null) return undefined;

  const [rows, { overview, total, builtFrom }, disagreements] = await Promise.all([
    pageQuery(db, topic.id, cursor),
    readTopicOverview(db, topic.id),
    readDisagreements(db, topic.id),
  ]);

  const built = new Map(builtFrom.map(({ item, digest }) => [item, digest]));
  const shown = rows.slice(0, ITEMS_PAGE_SIZE);
  const last = shown.at(-1);

  return {
    topic: { key: topic.key, name: topic.name, itemCount: total },
    overview,
    disagreements,
    items: shown.map((row) => ({
      id: row.id,
      source: row.source,
      title: row.title,
      summary: row.summary,
      savedAt: row.savedAt,
      read: row.readState === "read",
      inOverview: built.get(row.id) === row.digest,
    })),
    next:
      rows.length > shown.length && last !== undefined
        ? formatCursor({ savedAt: last.savedAt, id: last.id })
        : null,
  };
}
