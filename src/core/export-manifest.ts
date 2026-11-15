import { sql } from "drizzle-orm";

import { BACKUP_TABLES } from "./backup-tables.ts";
import { EXPORT_FORMAT, type ExportTally, exportRootName } from "./export-contract.ts";
import type { Database } from "./ports.ts";
import type { ZipFile } from "./zip.ts";

const TEXT = new TextEncoder();

export function recordPath(table: string, number: number): string {
  return `records/${table}.${String(number)}.jsonl`;
}

export async function manifestFile(
  db: Database,
  { createdAt, tally }: Readonly<{ createdAt: number; tally: ExportTally }>,
): Promise<ZipFile> {
  const [migration] = await db
    .select({ name: sql<string | null>`max(name)` })
    .from(sql`d1_migrations`);

  const steps = await db
    .select({ name: sql<string>`name`, version: sql<number>`version` })
    .from(sql`data_steps`)
    .orderBy(sql`name`);

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
    migration: migration?.name ?? null,
    dataSteps: Object.fromEntries(steps.map(({ name, version }) => [name, version])),
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
