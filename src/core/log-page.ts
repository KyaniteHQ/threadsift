import { desc, eq, lt } from "drizzle-orm";

import { ITEMS_PAGE_SIZE } from "./item-page.ts";
import { LogEntrySchema } from "./log-contract.ts";
import { pageTail } from "./page-tail.ts";
import type { Database } from "./ports.ts";
import { logEntries, logStart, topics } from "./schema.ts";

type Row = Readonly<Awaited<ReturnType<typeof logRows>>[number]>;

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
    case "vault-file-skipped":
      return { id, at, action, path: row.title };
    default:
      return action satisfies never;
  }
}

function logRows(db: Database, cursor: number | null, limit: number) {
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
    .limit(limit);
}

export async function readLogEntries(db: Database, cursor: number | null, limit: number) {
  return (await logRows(db, cursor, limit)).map((row) => LogEntrySchema.parse(entryOf(row)));
}

export async function readLog(db: Database, cursor: number | null) {
  const [rows, [start]] = await db.batch([
    logRows(db, cursor, ITEMS_PAGE_SIZE + 1),
    db.select({ startedAt: logStart.startedAt }).from(logStart).where(eq(logStart.id, 1)),
  ]);

  const { items, next } = pageTail(rows, ITEMS_PAGE_SIZE, ({ id }) => String(id));

  return {
    startedAt: start?.startedAt ?? 0,
    entries: items.map((row) => entryOf(row)),
    next,
  };
}
