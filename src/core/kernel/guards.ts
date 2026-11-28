import { type SQLWrapper, notExists, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { type SQLiteTable, check, integer, sqliteTable } from "drizzle-orm/sqlite-core";

import type { Database } from "./database.ts";

const REFUSED_AS = { write: 0, restore: 2, outcome: 3, budget: 4 } as const;

export type Refusal = keyof typeof REFUSED_AS;

const refusedAs = (refusal: Refusal) => sql.raw(String(REFUSED_AS[refusal]));

export const guards = sqliteTable(
  "guards",
  {
    ok: integer("ok").notNull(),
  },
  (table) => [
    check("guards_write", sql`${table.ok} <> ${refusedAs("write")}`),
    check("guards_restore", sql`${table.ok} <> ${refusedAs("restore")}`),
    check("guards_outcome", sql`${table.ok} <> ${refusedAs("outcome")}`),
    check("guards_budget", sql`${table.ok} <> ${refusedAs("budget")}`),
  ],
);

function failedCheck(refusal: Refusal): RegExp {
  return new RegExp(
    `CHECK constraint failed: (?:guards_${refusal}|ok <> ${REFUSED_AS[refusal]})(?:: SQLITE_[^\\n]*)?$`,
    "u",
  );
}

const REFUSALS = {
  write: failedCheck("write"),
  restore: failedCheck("restore"),
  outcome: failedCheck("outcome"),
  budget: failedCheck("budget"),
};

export function holdsNoRow(db: Database, table: SQLiteTable, matching: Readonly<SQLWrapper>) {
  return notExists(
    db
      .select({ one: sql`1` })
      .from(table)
      .where(sql`${matching}`),
  );
}

export function insertGuard(
  db: Database,
  condition: Readonly<SQLWrapper>,
  refusal: Refusal = "write",
) {
  return db.insert(guards).select(
    db
      .select({
        ok: sql<number>`case count(*) when 1 then 1 else ${refusedAs(refusal)} end`.as("ok"),
      })
      .from(sql`(select 1)`)
      .where(sql`${condition}`),
  );
}

export async function guardHolds(db: Database, condition: Readonly<SQLWrapper>): Promise<boolean> {
  const [current] = await db
    .select({ ok: sql<number>`count(*)` })
    .from(sql`(select 1)`)
    .where(sql`${condition}`);

  return current?.ok === 1;
}

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

function refusalOf(cause: unknown): Refusal | null {
  if (refusedBy(cause, REFUSALS.write)) return "write";

  if (refusedBy(cause, REFUSALS.restore)) return "restore";

  if (refusedBy(cause, REFUSALS.budget)) return "budget";

  return refusedBy(cause, REFUSALS.outcome) ? "outcome" : null;
}

export function refusedWith(cause: unknown, refusal: Refusal): boolean {
  return refusalOf(cause) === refusal;
}

export function refusedByGuard(cause: unknown): boolean {
  return refusalOf(cause) !== null;
}

export async function answeringRefusal<Result, Answer>(
  refusal: Refusal,
  run: () => Promise<Result>,
  answer: Answer,
): Promise<Result | Answer> {
  try {
    return await run();
  } catch (error) {
    if (!refusedWith(error, refusal)) throw error;

    return answer;
  }
}

export function unlessRefused<Result>(run: () => Promise<Result>): Promise<Result | null> {
  return answeringRefusal("write", run, null);
}

export function guardedWrites<Writes extends readonly BatchItem<"sqlite">[]>(
  db: Database,
  condition: Readonly<SQLWrapper>,
  writes: Writes,
) {
  return [insertGuard(db, condition), ...writes, db.delete(guards)] as const;
}

export async function guardedBatch(
  db: Database,
  condition: Readonly<SQLWrapper>,
  writes: readonly BatchItem<"sqlite">[],
): Promise<boolean> {
  return (await unlessRefused(() => db.batch(guardedWrites(db, condition, writes)))) !== null;
}

export function guardedWrite<Write extends BatchItem<"sqlite">>(
  db: Database,
  condition: Readonly<SQLWrapper>,
  write: Write,
  rest: readonly BatchItem<"sqlite">[],
): Promise<Write["_"]["result"] | null> {
  return unlessRefused(async () => {
    const [, result] = await db.batch(guardedWrites(db, condition, [write, ...rest] as const));

    return result;
  });
}
