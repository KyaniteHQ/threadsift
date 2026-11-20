import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";

import { ITEM_FILES_STREAM } from "../contract/export-contract.ts";
import { BACKUP_TABLES, backupTable } from "../kernel/backup-tables.ts";
import type { Database } from "../kernel/database.ts";
import { hasOpenJob } from "../kernel/job-rows.ts";

export type RecordRow = Readonly<Record<string, string | number | null>>;

const FIRST_TABLES = ["topics", "tags"] as const;

const ROW = "__row";

const COUNT = "__count";

const OWN = "__own";

const RUNNING = "__running";

const CellSchema = z.union([z.string(), z.number(), z.null()]);

const PageRowSchema = z.record(z.string(), CellSchema);

export const STREAMS: readonly string[] = [
  ...FIRST_TABLES,
  ...Object.keys(BACKUP_TABLES).filter((name) => !FIRST_TABLES.some((first) => first === name)),
  ITEM_FILES_STREAM,
];

function columnsOf(table: string): readonly string[] {
  return backupTable(table).columns;
}

export const STREAM_LIST = STREAMS.map((name) =>
  name === ITEM_FILES_STREAM ? name : `${name}(${columnsOf(name).join(" ")})`,
).join(",");

function scopeOf(table: string): SQL {
  return backupTable(table).scope === "per-item-digest-tasks"
    ? sql`id in (select task_id from digests)`
    : sql`1`;
}

function identifiers(names: readonly string[]): SQL {
  return sql.join(
    names.map((name) => sql.identifier(name)),
    sql`, `,
  );
}

function sizeOf(columns: readonly string[]): SQL {
  return sql.join(
    columns.map((column) => sql`coalesce(length(cast(${sql.identifier(column)} as blob)), 0)`),
    sql` + `,
  );
}

interface TablePage {
  readonly rows: readonly RecordRow[];
  readonly first: number;
  readonly last: number;
  readonly done: boolean;
}

export async function tablePage(
  db: Database,
  table: string,
  { after, limit, budget }: Readonly<{ after: number; limit: number; budget: number }>,
): Promise<TablePage> {
  const columns = columnsOf(table);

  const windowed = sql`select ${identifiers(columns)}, ${sql.identifier(ROW)}, ${sql.identifier(OWN)}, sum(${sql.identifier(OWN)}) over (order by ${sql.identifier(ROW)}) as ${sql.identifier(RUNNING)}, count(*) over () as ${sql.identifier(COUNT)} from (select ${identifiers(columns)}, rowid as ${sql.identifier(ROW)}, ${sizeOf(columns)} as ${sql.identifier(OWN)} from ${sql.identifier(table)} where ${scopeOf(table)} and rowid > ${after} order by rowid limit ${limit})`;

  const fields = Object.fromEntries(
    [...columns, ROW, COUNT].map((name) => [name, sql`${sql.identifier(name)}`]),
  );

  const found = z.array(PageRowSchema).parse(
    await db
      .select(fields)
      .from(sql`(${windowed}) as paged`)
      .where(sql`${sql.identifier(RUNNING)} - ${sql.identifier(OWN)} < ${budget}`)
      .orderBy(sql`${sql.identifier(ROW)}`),
  );

  const first = z.number().safeParse(found.at(0)?.[ROW]);
  const last = z.number().safeParse(found.at(-1)?.[ROW]);
  const read = z.number().safeParse(found.at(-1)?.[COUNT]);

  return {
    rows: found.map((row) =>
      Object.fromEntries(Object.entries(row).filter(([name]) => name !== ROW && name !== COUNT)),
    ),
    first: first.success ? first.data : after,
    last: last.success ? last.data : after,
    done: !read.success || (read.data < limit && read.data === found.length),
  };
}

export async function openItemCount(
  db: Database,
  { first, last }: Readonly<{ first: number; last: number }>,
) {
  const [counted] = await db
    .select({ count: sql<number>`count(*)` })
    .from(sql`items`)
    .where(
      sql`id >= ${first} and id <= ${last} and exists ${hasOpenJob(undefined, sql`items.id`)}`,
    );

  return counted?.count ?? 0;
}
