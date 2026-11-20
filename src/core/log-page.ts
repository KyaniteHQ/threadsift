import { and, desc, eq, gte, lt } from "drizzle-orm";

import type { Database } from "./database.ts";
import { ITEMS_PAGE_SIZE } from "./item-page.ts";
import type { FieldOf } from "./log-actions.ts";
import { type LogEntry, type LogPage, LogEntrySchema } from "./log-contract.ts";
import { pageTail } from "./page-tail.ts";
import { logEntries, logStart, topics } from "./schema.ts";

type Row = Readonly<Awaited<ReturnType<typeof logRows>>[number]>;

type FieldType<Field extends FieldOf<LogEntry>> = LogEntry extends infer Entry
  ? Entry extends { readonly [Key in Field]: infer Value }
    ? Value
    : never
  : never;

type Stored<Value> = Value extends readonly unknown[]
  ? Value | null
  : Value extends object
    ? { readonly [Key in keyof Value]: Value[Key] | null }
    : Value | null;

function entryOf(row: Row) {
  return LogEntrySchema.parse({
    id: row.id,
    at: row.at,
    action: row.action,
    item: { id: row.itemId, title: row.title },
    topic: { key: row.topicKey, name: row.topic },
    tags: row.tags,
    added: row.added,
    removed: row.removed,
    picks: row.picks,
    from: row.mergedFrom,
    into: row.mergedInto,
    items: row.moved,
    path: row.path,
  } satisfies { readonly [Field in FieldOf<LogEntry>]: Stored<FieldType<Field>> });
}

interface LogRange {
  readonly start: number;
  readonly end: number;
}

function logRows(db: Database, cursor: number | null, limit: number, range?: LogRange) {
  return db
    .select({
      id: logEntries.id,
      at: logEntries.at,
      action: logEntries.action,
      title: logEntries.title,
      path: logEntries.path,
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
    .where(
      and(
        cursor === null ? undefined : lt(logEntries.id, cursor),
        range === undefined
          ? undefined
          : and(gte(logEntries.at, range.start), lt(logEntries.at, range.end)),
      ),
    )
    .orderBy(desc(logEntries.id))
    .limit(limit);
}

export async function readLogEntries(
  db: Database,
  cursor: number | null,
  limit: number,
  range: LogRange,
) {
  return (await logRows(db, cursor, limit, range)).map((row) => entryOf(row));
}

export async function readLog(db: Database, cursor: number | null): Promise<LogPage> {
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
