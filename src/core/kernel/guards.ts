import { type SQLWrapper, notExists, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { type SQLiteTable, check, integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { z } from "zod";

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

const GUARD_REFUSED = /CHECK constraint failed: (?:guards_hold|ok = 1)(?:: SQLITE_[^\n]*)?$/u;

function innermostError(cause: unknown): Error | null {
  const seen = new Set<Error>();
  let innermost: Error | null = null;

  for (let link = cause; link instanceof Error && !seen.has(link); link = link.cause) {
    seen.add(link);
    innermost = link;
  }

  return innermost;
}

export function refusedBy(cause: unknown, refusal: Readonly<RegExp>): boolean {
  const database = innermostError(cause);

  return database !== null && refusal.test(database.message);
}

export function refusedByGuard(cause: unknown): boolean {
  return refusedBy(cause, GUARD_REFUSED);
}

export async function unlessRefused<Result>(
  db: Database,
  condition: Readonly<SQLWrapper>,
  run: () => Promise<Result>,
): Promise<Result | null> {
  try {
    return await run();
  } catch (error) {
    if (!refusedByGuard(error) || (await guardHeldOrUnread(db, condition))) throw error;

    return null;
  }
}

function guardedWrites<Writes extends readonly BatchItem<"sqlite">[]>(
  db: Database,
  condition: Readonly<SQLWrapper>,
  writes: Writes,
) {
  return [insertGuard(db, condition), ...writes, db.delete(guards)] as const;
}

export type OpeningWrite = BatchItem<"sqlite"> & {
  readonly _: { readonly result: readonly Readonly<{ id: number }>[] };
};

const OpenedSchema = z.array(z.object({ id: z.number().int() }));

export function guardedOpenings(
  db: Database,
  condition: Readonly<SQLWrapper>,
  {
    before,
    opening,
    after = [],
  }: Readonly<{
    before: readonly BatchItem<"sqlite">[];
    opening: readonly OpeningWrite[];
    after?: readonly BatchItem<"sqlite">[];
  }>,
): Promise<readonly Readonly<{ id: number }>[] | null> {
  return unlessRefused(db, condition, async () => {
    const results = await db.batch(guardedWrites(db, condition, [...before, ...opening, ...after]));
    const first = 1 + before.length;

    return results
      .slice(first, first + opening.length)
      .flatMap((opened) => OpenedSchema.parse(opened));
  });
}

export async function guardedBatch(
  db: Database,
  condition: Readonly<SQLWrapper>,
  writes: readonly BatchItem<"sqlite">[],
): Promise<boolean> {
  return (await guardedOpenings(db, condition, { before: writes, opening: [] })) !== null;
}

export function guardedWrite<Write extends BatchItem<"sqlite">>(
  db: Database,
  condition: Readonly<SQLWrapper>,
  write: Write,
  rest: readonly BatchItem<"sqlite">[],
): Promise<Write["_"]["result"] | null> {
  return unlessRefused(db, condition, async () => {
    const [, result] = await db.batch(guardedWrites(db, condition, [write, ...rest] as const));

    return result;
  });
}
