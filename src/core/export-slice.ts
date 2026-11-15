import { sql } from "drizzle-orm";

import { BACKUP_TABLES } from "./backup-tables.ts";
import {
  EXPORT_ENTRY_BYTES,
  EXPORT_FORMAT,
  EXPORT_ITEM_GROUP,
  EXPORT_PAGE_ROWS,
  EXPORT_SLICE_BYTES,
  EXPORT_SLICE_ITEMS,
  type ExportTally,
  ExportTallySchema,
  exportRootName,
} from "./export-contract.ts";
import {
  ITEM_STREAM,
  ITEM_TABLES,
  type RecordRow,
  STREAMS,
  WHOLE_TABLES,
  itemIdsAfter,
  itemRows,
  openItemCount,
  wholeTablePage,
} from "./export-records.ts";
import type { Database } from "./ports.ts";
import type { ExportRow } from "./schema.ts";
import { type ZipFile, joined } from "./zip.ts";

const TEXT = new TextEncoder();

interface Taken {
  readonly table: string;
  readonly lines: readonly Uint8Array[];
}

interface Progress {
  readonly stream: number;
  readonly cursor: number;
  readonly items: number;
  readonly bytes: number;
  readonly openItems: number;
  readonly taken: readonly Taken[];
}

function takenFrom(table: string, rows: readonly RecordRow[]): Taken {
  return { table, lines: rows.map((row) => TEXT.encode(`${JSON.stringify(row)}\n`)) };
}

function sizeOf({ lines }: Readonly<Taken>): number {
  return lines.reduce((sum, line) => sum + line.length, 0);
}

function entriesOf(lines: readonly Uint8Array[]): readonly Uint8Array[] {
  const entries: Uint8Array[] = [];
  let current: Uint8Array[] = [];
  let bytes = 0;

  for (const line of lines) {
    if (bytes > 0 && bytes + line.length > EXPORT_ENTRY_BYTES) {
      entries.push(joined(current));
      current = [];
      bytes = 0;
    }

    current.push(line);
    bytes += line.length;
  }

  return bytes === 0 ? entries : [...entries, joined(current)];
}

function recordPath(table: string, number: number): string {
  return `records/${table}.${String(number)}.jsonl`;
}

function recordFiles(root: string, tally: Readonly<ExportTally>, taken: readonly Taken[]) {
  const tables = [...new Set(taken.map(({ table }) => table))];
  const counted = { ...tally.tables };
  const files: ZipFile[] = [];

  for (const table of tables) {
    const lines = taken.filter((one) => one.table === table).flatMap((one) => one.lines);
    const before = counted[table] ?? { files: 0, rows: 0 };
    const entries = entriesOf(lines);

    entries.forEach((bytes, at) => {
      files.push({ name: `${root}/${recordPath(table, before.files + at + 1)}`, bytes });
    });
    counted[table] = { files: before.files + entries.length, rows: before.rows + lines.length };
  }

  return { files, tally: { ...tally, tables: counted } };
}

async function takeWholeTable(db: Database, progress: Readonly<Progress>): Promise<Progress> {
  const table = WHOLE_TABLES[progress.stream] ?? "";
  const page = await wholeTablePage(db, table, progress.cursor, EXPORT_PAGE_ROWS);
  const taken = takenFrom(table, page.rows);

  return {
    ...progress,
    stream: page.done ? progress.stream + 1 : progress.stream,
    cursor: page.done ? 0 : page.last,
    bytes: progress.bytes + sizeOf(taken),
    taken: [...progress.taken, taken],
  };
}

async function takeItems(db: Database, progress: Readonly<Progress>): Promise<Progress> {
  const ids = await itemIdsAfter(db, progress.cursor, EXPORT_ITEM_GROUP);
  const upTo = ids.at(-1);

  if (upTo === undefined) return { ...progress, stream: STREAMS.length };

  const range = { after: progress.cursor, upTo };

  const [open, ...found] = await Promise.all([
    openItemCount(db, range),
    ...ITEM_TABLES.map((table) => itemRows(db, table, range)),
  ]);

  const taken = ITEM_TABLES.map((table, at) => takenFrom(table, found[at] ?? []));

  return {
    stream: ids.length < EXPORT_ITEM_GROUP ? STREAMS.length : progress.stream,
    cursor: upTo,
    items: progress.items + ids.length,
    bytes: progress.bytes + taken.reduce((sum, one) => sum + sizeOf(one), 0),
    openItems: progress.openItems + (open ?? 0),
    taken: [...progress.taken, ...taken],
  };
}

function hasRoom({ stream, items, bytes }: Readonly<Progress>): boolean {
  return stream < STREAMS.length && items < EXPORT_SLICE_ITEMS && bytes < EXPORT_SLICE_BYTES;
}

async function fill(db: Database, progress: Readonly<Progress>): Promise<Progress> {
  if (!hasRoom(progress)) return progress;

  return fill(
    db,
    progress.stream < ITEM_STREAM
      ? await takeWholeTable(db, progress)
      : await takeItems(db, progress),
  );
}

async function manifestFile(
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

export interface BuiltSlice {
  readonly files: readonly ZipFile[];
  readonly stream: number;
  readonly cursor: number;
  readonly tally: ExportTally;
  readonly finished: boolean;
}

export async function buildSlice(
  db: Database,
  run: Readonly<Pick<ExportRow, "createdAt" | "stream" | "cursor" | "tally">>,
): Promise<BuiltSlice> {
  const before = ExportTallySchema.parse(JSON.parse(run.tally));

  const progress = await fill(db, {
    stream: run.stream,
    cursor: run.cursor,
    items: 0,
    bytes: 0,
    openItems: 0,
    taken: [],
  });

  const { files, tally } = recordFiles(exportRootName(run.createdAt), before, progress.taken);
  const counted = { ...tally, openItems: tally.openItems + progress.openItems };
  const finished = progress.stream >= STREAMS.length;

  return {
    files: finished
      ? [...files, await manifestFile(db, { createdAt: run.createdAt, tally: counted })]
      : files,
    stream: progress.stream,
    cursor: progress.cursor,
    tally: counted,
    finished,
  };
}
