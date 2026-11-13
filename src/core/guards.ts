import { type SQLWrapper, notExists, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { type SQLiteTable, check, integer, sqliteTable } from "drizzle-orm/sqlite-core";

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

export const DATABASE_NOW = sql<number>`cast((julianday('now') - 2440587.5) * 86400000 as integer)`;

export async function batchAll(
  db: Database,
  writes: readonly BatchItem<"sqlite">[],
): Promise<void> {
  const [first, ...rest] = writes;

  if (first !== undefined) await db.batch([first, ...rest]);
}

export function amongJson(column: Readonly<SQLWrapper>, json: string) {
  return sql`${column} in (select value from json_each(${json}))`;
}

export function among(column: Readonly<SQLWrapper>, values: readonly (number | string)[]) {
  return amongJson(column, JSON.stringify(values));
}

export function holdsNoRow(db: Database, table: SQLiteTable, matching: Readonly<SQLWrapper>) {
  return notExists(
    db
      .select({ one: sql`1` })
      .from(table)
      .where(sql`${matching}`),
  );
}

export function insertGuard(db: Database, condition: Readonly<SQLWrapper>) {
  return db.insert(guards).select(guardRows(db, condition));
}

export async function guardHolds(db: Database, condition: Readonly<SQLWrapper>): Promise<boolean> {
  const [current] = await guardRows(db, condition);

  return current?.ok === 1;
}

export async function unlessRefused<Written>(
  db: Database,
  condition: Readonly<SQLWrapper>,
  write: () => Promise<Written>,
): Promise<Written | null> {
  try {
    return await write();
  } catch (error) {
    if (await guardHolds(db, condition)) throw error;

    return null;
  }
}

const GUARD_REFUSED = /CHECK constraint failed: (?:guards_hold|ok = 1)/u;

export function refusedBy(cause: unknown, refusal: Readonly<RegExp>): boolean {
  for (let link = cause; link instanceof Error; link = link.cause) {
    if (refusal.test(link.message)) return true;
  }

  return false;
}

export function refusedByGuard(cause: unknown): boolean {
  return refusedBy(cause, GUARD_REFUSED);
}

async function rethrowUnlessRefused(
  db: Database,
  condition: Readonly<SQLWrapper>,
  cause: unknown,
): Promise<void> {
  if (!refusedByGuard(cause) || (await guardHolds(db, condition))) throw cause;
}

export async function guardedResults(
  db: Database,
  condition: Readonly<SQLWrapper>,
  writes: readonly BatchItem<"sqlite">[],
): Promise<readonly unknown[] | null> {
  try {
    const [, ...results] = await db.batch([
      insertGuard(db, condition),
      ...writes,
      db.delete(guards),
    ]);

    const written: readonly unknown[] = results.slice(0, writes.length);

    return written;
  } catch (error) {
    await rethrowUnlessRefused(db, condition, error);

    return null;
  }
}

export async function guardedBatch(
  db: Database,
  condition: Readonly<SQLWrapper>,
  writes: readonly BatchItem<"sqlite">[],
): Promise<boolean> {
  return (await guardedResults(db, condition, writes)) !== null;
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
    await rethrowUnlessRefused(db, condition, error);

    return null;
  }
}
