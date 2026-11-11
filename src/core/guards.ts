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

export function holdsNoRow(
  db: Database,
  // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a Drizzle table type holds mutable column objects, so it cannot be deeply readonly.
  table: SQLiteTable,
  matching: Readonly<SQLWrapper>,
) {
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

const GUARD_REFUSED = /CHECK constraint failed: (?:guards_hold|ok = 1)/u;

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- a catch variable is unparsed by construction, and this function reduces it to whether a guard check failed.
function refusedByGuard(error: unknown): boolean {
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if (GUARD_REFUSED.test(cause.message)) return true;
  }

  return false;
}

async function rethrowUnlessRefused(
  db: Database,
  condition: Readonly<SQLWrapper>,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- a catch variable is unparsed by construction.
  error: unknown,
): Promise<void> {
  if (!refusedByGuard(error) || (await guardHolds(db, condition))) throw error;
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
    await rethrowUnlessRefused(db, condition, error);

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
    await rethrowUnlessRefused(db, condition, error);

    return null;
  }
}
