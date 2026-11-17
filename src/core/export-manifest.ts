import { sql } from "drizzle-orm";

import { BACKUP_TABLES } from "./backup-tables.ts";
import { EXPORT_FORMAT, type ExportTally, exportRootName } from "./export-contract.ts";
import type { Database } from "./ports.ts";
import type { ZipDirectory } from "./zip-read.ts";
import type { ZipFile } from "./zip.ts";

const TEXT = new TextEncoder();

const RECORD_FOLDER = "records/";

export function recordPath(table: string, number: number): string {
  return `${RECORD_FOLDER}${table}.${String(number)}.jsonl`;
}

export function recordTableOf(directory: Readonly<ZipDirectory>, name: string): string | null {
  const prefix = `${directory.root}/${RECORD_FOLDER}`;

  return name.startsWith(prefix) ? (name.slice(prefix.length).split(".")[0] ?? "") : null;
}

export async function appliedMigration(db: Database): Promise<string | null> {
  const [migration] = await db
    .select({ name: sql<string | null>`max(name)` })
    .from(sql`d1_migrations`);

  return migration?.name ?? null;
}

export async function manifestFile(
  db: Database,
  { createdAt, tally }: Readonly<{ createdAt: number; tally: ExportTally }>,
): Promise<ZipFile> {
  const sequences = await db
    .select({ name: sql<string>`name`, seq: sql<number>`seq` })
    .from(sql`sqlite_sequence`)
    .orderBy(sql`name`);

  const tables = Object.keys(BACKUP_TABLES).map((table) => {
    const counted = tally.tables[table] ?? { files: 0, rows: 0 };

    return [
      table,
      {
        files: Array.from({ length: counted.files }, (_, at) => recordPath(table, at + 1)),
        rows: counted.rows,
      },
    ] as const;
  });

  const manifest = {
    format: EXPORT_FORMAT,
    exportedAt: new Date(createdAt).toISOString(),
    migration: await appliedMigration(db),
    tables: Object.fromEntries(tables),
    sequences: Object.fromEntries(
      sequences
        .filter(({ name }) => Object.hasOwn(BACKUP_TABLES, name))
        .map(({ name, seq }) => [name, seq]),
    ),
    openItems: tally.openItems,
  };

  return {
    name: `${exportRootName(createdAt)}/threadsift.json`,
    bytes: TEXT.encode(`${JSON.stringify(manifest, null, 2)}\n`),
  };
}
