import { desc, eq, lt } from "drizzle-orm";

import { ITEMS_PAGE_SIZE } from "./item-page.ts";
import { type LogPage, LogEntrySchema } from "./log-contract.ts";
import type { Database } from "./ports.ts";
import { logEntries, logStart, topics } from "./schema.ts";

type Row = Readonly<{
  id: number;
  at: number;
  action: string;
  title: string | null;
  topic: string | null;
  topicKey: string | null;
  tags: readonly string[] | null;
  added: number | null;
  removed: number | null;
  picks: number | null;
  itemId: number | null;
}>;

function entryOf(row: Row) {
  const { id, at, action } = row;
  const item = { id: row.itemId, title: row.title };
  const topic = { key: row.topicKey, name: row.topic };

  return LogEntrySchema.parse(
    {
      ingest: { id, at, action, item, topic, tags: row.tags },
      digest: { id, at, action, item, topic, tags: row.tags },
      topic: { id, at, action, topic },
      overview: { id, at, action, topic, added: row.added, removed: row.removed },
      related: { id, at, action, item, picks: row.picks },
    }[action],
  );
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
      itemId: logEntries.itemId,
    })
    .from(logEntries)
    .leftJoin(topics, eq(topics.id, logEntries.topicId))
    .where(cursor === null ? undefined : lt(logEntries.id, cursor))
    .orderBy(desc(logEntries.id))
    .limit(ITEMS_PAGE_SIZE + 1);
}

export async function readLog(db: Database, cursor: number | null): Promise<LogPage> {
  const [rows, [start]] = await db.batch([
    pageQuery(db, cursor),
    db.select({ startedAt: logStart.startedAt }).from(logStart).where(eq(logStart.id, 1)),
  ]);

  const shown = rows.slice(0, ITEMS_PAGE_SIZE);
  const last = shown.at(-1);

  return {
    startedAt: start?.startedAt ?? 0,
    entries: shown.map((row) => entryOf(row)),
    next: rows.length > shown.length && last !== undefined ? String(last.id) : null,
  };
}
