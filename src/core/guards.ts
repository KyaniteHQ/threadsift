import { type SQLWrapper, notExists, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { type SQLiteTable, check, integer, sqliteTable } from "drizzle-orm/sqlite-core";

import type { Database } from "./database.ts";
import { readOrAssume } from "./failure-log.ts";

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

function guardHeldOrUnread(db: Database, condition: Readonly<SQLWrapper>): Promise<boolean> {
  return readOrAssume(true, { event: "guard-read-failed", fields: {} }, () =>
    guardHolds(db, condition),
  );
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

async function nullWhenRefused<Result>(
  db: Database,
  condition: Readonly<SQLWrapper>,
  run: () => Promise<Result>,
  couldBeRefusal: (cause: unknown) => boolean,
): Promise<Result | null> {
  try {
    return await run();
  } catch (error) {
    if (!couldBeRefusal(error) || (await guardHeldOrUnread(db, condition))) throw error;

    return null;
  }
}

export function unlessRefused<Written>(
  db: Database,
  condition: Readonly<SQLWrapper>,
  write: () => Promise<Written>,
): Promise<Written | null> {
  return nullWhenRefused(db, condition, write, () => true);
}

function guardedWrites<Writes extends readonly BatchItem<"sqlite">[]>(
  db: Database,
  condition: Readonly<SQLWrapper>,
  writes: Writes,
) {
  return [insertGuard(db, condition), ...writes, db.delete(guards)] as const;
}

export function guardedResults(
  db: Database,
  condition: Readonly<SQLWrapper>,
  writes: readonly BatchItem<"sqlite">[],
): Promise<readonly unknown[] | null> {
  return nullWhenRefused(
    db,
    condition,
    async () => {
      const [, ...results] = await db.batch(guardedWrites(db, condition, writes));

      const written: readonly unknown[] = results.slice(0, writes.length);

      return written;
    },
    refusedByGuard,
  );
}

export async function guardedBatch(
  db: Database,
  condition: Readonly<SQLWrapper>,
  writes: readonly BatchItem<"sqlite">[],
): Promise<boolean> {
  return (await guardedResults(db, condition, writes)) !== null;
}

export function guardedWrite<Write extends BatchItem<"sqlite">>(
  db: Database,
  condition: Readonly<SQLWrapper>,
  write: Write,
  rest: readonly BatchItem<"sqlite">[],
): Promise<Write["_"]["result"] | null> {
  return nullWhenRefused(
    db,
    condition,
    async () => {
      const [, result] = await db.batch(guardedWrites(db, condition, [write, ...rest] as const));

      return result;
    },
    refusedByGuard,
  );
}
