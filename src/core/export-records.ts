import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";

import { BACKUP_TABLES, type BackupScope } from "./backup-tables.ts";
import { hasOpenJob } from "./job-rows.ts";
import type { Database } from "./ports.ts";

export type RecordRow = Readonly<Record<string, string | number | null>>;

const FIRST_TABLES = ["topics", "tags"] as const;

const ROWID = "rowid";

const CellSchema = z.union([z.string(), z.number(), z.null()]);

const RowSchema = z.record(z.string(), CellSchema);

function tablesOf(...scopes: readonly BackupScope[]): readonly string[] {
  return Object.entries(BACKUP_TABLES).flatMap(([name, table]) =>
    scopes.includes(table.scope) ? [name] : [],
  );
}

export const WHOLE_TABLES: readonly string[] = [
  ...FIRST_TABLES,
  ...tablesOf("whole-table").filter((name) => !FIRST_TABLES.some((first) => first === name)),
];

export const ITEM_TABLES: readonly string[] = tablesOf("per-item", "per-item-digest-tasks");

export const ITEM_STREAM = WHOLE_TABLES.length;

export const STREAMS: readonly string[] = [...WHOLE_TABLES, "items"];

function columnsOf(table: string): readonly string[] {
  const listed = Object.entries(BACKUP_TABLES).find(([name]) => name === table)?.[1];

  if (listed === undefined) throw new Error(`${table} is not in the backup list`);

  return listed.columns;
}

async function selectRows(
  db: Database,
  table: string,
  columns: readonly string[],
  tail: Readonly<{ where: SQL; limit?: number }>,
): Promise<readonly RecordRow[]> {
  const fields = Object.fromEntries(
    columns.map((column) => [column, sql`${sql.identifier(column)}`]),
  );

  const query = db
    .select(fields)
    .from(sql`${sql.identifier(table)}`)
    .where(tail.where)
    .orderBy(sql`rowid`);

  return z
    .array(RowSchema)
    .parse(tail.limit === undefined ? await query : await query.limit(tail.limit));
}

export interface WholeTablePage {
  readonly rows: readonly RecordRow[];
  readonly last: number;
  readonly done: boolean;
}

export async function wholeTablePage(
  db: Database,
  table: string,
  after: number,
  limit: number,
): Promise<WholeTablePage> {
  const found = await selectRows(db, table, [...columnsOf(table), ROWID], {
    where: sql`rowid > ${after}`,
    limit,
  });

  const last = z.number().safeParse(found.at(-1)?.[ROWID]);

  return {
    rows: found.map((row) =>
      Object.fromEntries(Object.entries(row).filter(([name]) => name !== ROWID)),
    ),
    last: last.success ? last.data : after,
    done: found.length < limit,
  };
}

export async function itemIdsAfter(db: Database, after: number, limit: number) {
  const found = await db
    .select({ id: sql<number>`id` })
    .from(sql`items`)
    .where(sql`id > ${after}`)
    .orderBy(sql`id`)
    .limit(limit);

  return found.map(({ id }) => id);
}

export interface ItemRange {
  readonly after: number;
  readonly upTo: number;
}

function itemScope(table: string, { after, upTo }: Readonly<ItemRange>): SQL {
  if (table === "ai_tasks") {
    return sql`id in (select task_id from digests where item_id > ${after} and item_id <= ${upTo})`;
  }

  const owner = table === "items" ? sql`id` : sql`item_id`;

  return sql`${owner} > ${after} and ${owner} <= ${upTo}`;
}

export function itemRows(db: Database, table: string, range: Readonly<ItemRange>) {
  return selectRows(db, table, columnsOf(table), { where: itemScope(table, range) });
}

export async function openItemCount(db: Database, { after, upTo }: Readonly<ItemRange>) {
  const [counted] = await db
    .select({ count: sql<number>`count(*)` })
    .from(sql`items`)
    .where(sql`id > ${after} and id <= ${upTo} and exists ${hasOpenJob(undefined, sql`items.id`)}`);

  return counted?.count ?? 0;
}
