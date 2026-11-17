import { desc, eq, lt } from "drizzle-orm";

import { ITEMS_PAGE_SIZE, pageTail } from "./item-page.ts";
import type { Database } from "./ports.ts";
import { logEntries, logStart, topics } from "./schema.ts";

type Row = Readonly<Awaited<ReturnType<typeof pageQuery>>[number]>;

function entryOf(row: Row) {
  const { id, at, action } = row;
  const item = { id: row.itemId, title: row.title };
  const topic = { key: row.topicKey, name: row.topic };
  const merged = { id, at, from: row.mergedFrom, into: row.mergedInto, items: row.moved };

  switch (action) {
    case "ingest":
    case "digest":
      return { id, at, action, item, topic, tags: row.tags };
    case "topic":
      return { id, at, action, topic };
    case "overview":
      return { id, at, action, topic, added: row.added, removed: row.removed };
    case "related":
      return { id, at, action, item, picks: row.picks };
    case "merge":
    case "merge-topic":
      return { ...merged, action };
    default:
      return action satisfies never;
  }
}

function pageQuery(db: Database, cursor: number | null) {
  return db
    .select({
      id: logEntries.id,
      at: logEntries.at,
      action: logEntries.action,
      title: logEntries.title,
      topic: logEntries.topic,
      topicKey: topics.key,
      tags: logEntries.tags,
      added: logEntries.added,
      removed: logEntries.removed,
      picks: logEntries.picks,
      mergedFrom: logEntries.mergedFrom,
      mergedInto: logEntries.mergedInto,
      moved: logEntries.moved,
      itemId: logEntries.itemId,
    })
    .from(logEntries)
    .leftJoin(topics, eq(topics.id, logEntries.topicId))
    .where(cursor === null ? undefined : lt(logEntries.id, cursor))
    .orderBy(desc(logEntries.id))
    .limit(ITEMS_PAGE_SIZE + 1);
}

export async function readLog(db: Database, cursor: number | null) {
  const [rows, [start]] = await db.batch([
    pageQuery(db, cursor),
    db.select({ startedAt: logStart.startedAt }).from(logStart).where(eq(logStart.id, 1)),
  ]);

  const { items, next } = pageTail(rows, ITEMS_PAGE_SIZE, ({ id }) => String(id));

  return {
    startedAt: start?.startedAt ?? 0,
    entries: items.map((row) => entryOf(row)),
    next,
  };
}
