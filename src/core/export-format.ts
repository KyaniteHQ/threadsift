import { sql } from "drizzle-orm";
import { z } from "zod";

import { BACKUP_TABLES } from "./backup-tables.ts";
import type { Database } from "./database.ts";
import type { ExportTally } from "./export-contract.ts";
import { WholeCount } from "./whole-count.ts";
import type { ZipDirectory } from "./zip-read.ts";
import type { ZipFile } from "./zip.ts";

const EXPORT_FORMAT = 1;

const TEXT = new TextEncoder();

const RECORD_FOLDER = "records/";

const MANIFEST_FILE = "threadsift.json";

export const ManifestSchema = z
  .object({
    format: z.literal(EXPORT_FORMAT),
    migration: z.string().nullable(),
    tables: z
      .record(
        z.string(),
        z.object({ files: z.array(z.string()).readonly(), rows: WholeCount }).readonly(),
      )
      .readonly(),
    sequences: z.record(z.string(), WholeCount).readonly(),
  })
  .readonly();

export type Manifest = z.infer<typeof ManifestSchema>;

type WrittenManifest = Manifest & Readonly<{ exportedAt: string; openItems: number }>;

function exportDay(createdAt: number): string {
  return new Date(createdAt).toISOString().slice(0, 10);
}

export function exportRootName(createdAt: number): string {
  return `threadsift-${exportDay(createdAt)}`;
}

export function manifestName(root: string): string {
  return `${root}/${MANIFEST_FILE}`;
}

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

  const manifest: WrittenManifest = {
    format: EXPORT_FORMAT,
    exportedAt: new Date(createdAt).toISOString(),
    migration: await appliedMigration(db),
    tables: Object.fromEntries(tables),
    sequences: Object.fromEntries(
      sequences
        .filter(({ name }) => Object.hasOwn(BACKUP_TABLES, name))
        .map(({ name, seq }) => [name, seq] as const),
    ),
    openItems: tally.openItems,
  };

  return {
    name: manifestName(exportRootName(createdAt)),
    bytes: TEXT.encode(`${JSON.stringify(manifest, null, 2)}\n`),
  };
}
