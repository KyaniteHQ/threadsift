import { type SQLWrapper, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { check, integer, sqliteTable } from "drizzle-orm/sqlite-core";

import type { Database } from "./ports.ts";

export const guards = sqliteTable(
  "guards",
  {
    ok: integer("ok").notNull(),
  },
  (table) => [check("guards_hold", sql`${table.ok} = 1`)],
);

function guardRows(db: Database, condition: Readonly<SQLWrapper>) {
  return db
    .select({ ok: sql<number>`count(*)`.as("ok") })
    .from(sql`(select 1)`)
    .where(sql`${condition}`);
}

export function insertGuard(db: Database, condition: Readonly<SQLWrapper>) {
  return db.insert(guards).select(guardRows(db, condition));
}

export async function guardHolds(db: Database, condition: Readonly<SQLWrapper>): Promise<boolean> {
  const [current] = await guardRows(db, condition);

  return current?.ok === 1;
}

export async function guardedBatch(
  db: Database,
  condition: Readonly<SQLWrapper>,
  writes: readonly BatchItem<"sqlite">[],
): Promise<boolean> {
  try {
    await db.batch([insertGuard(db, condition), ...writes, db.delete(guards)]);

    return true;
  } catch (error) {
    if (await guardHolds(db, condition)) throw error;

    return false;
  }
}

export async function guardedWrite<Write extends BatchItem<"sqlite">>(
  db: Database,
  condition: Readonly<SQLWrapper>,
  write: Write,
  rest: readonly BatchItem<"sqlite">[],
): Promise<Write["_"]["result"] | null> {
  try {
    const [, result] = await db.batch([
      insertGuard(db, condition),
      write,
      ...rest,
      db.delete(guards),
    ]);

    return result;
  } catch (error) {
    if (await guardHolds(db, condition)) throw error;

    return null;
  }
}
