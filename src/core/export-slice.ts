import {
  EXPORT_ENTRY_BYTES,
  EXPORT_PAGE_ROWS,
  EXPORT_SLICE_BYTES,
  EXPORT_SLICE_ITEMS,
  ITEM_FILES_STREAM,
  type ExportTally,
  ExportTallySchema,
  type PartialItem,
  exportRootName,
} from "./export-contract.ts";
import { takeItems } from "./export-items.ts";
import { manifestFile, recordPath } from "./export-manifest.ts";
import {
  type RecordRow,
  STREAMS,
  STREAM_LIST,
  openItemCount,
  tablePage,
} from "./export-records.ts";
import type { Database, Ports } from "./ports.ts";
import type { ExportRow } from "./schema.ts";
import { type ZipFile, joined } from "./zip.ts";

const TEXT = new TextEncoder();

const FIRST_PAGE_ROWS = 20;

interface Taken {
  readonly table: string;
  readonly lines: readonly Uint8Array[];
}

interface Progress {
  readonly position: number;
  readonly cursor: number;
  readonly bytes: number;
  readonly openItems: number;
  readonly perRow: number;
  readonly taken: readonly Taken[];
  readonly finished: readonly string[];
  readonly itemFiles: readonly ZipFile[];
  readonly itemCount: number;
  readonly partial: PartialItem | null;
  readonly full: boolean;
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

function recordFiles(
  root: string,
  tally: Readonly<ExportTally>,
  { taken, finished }: Readonly<Pick<Progress, "taken" | "finished">>,
) {
  const tables = [...new Set([...taken.map(({ table }) => table), ...finished])];
  const counted = { ...tally.tables };
  const files: ZipFile[] = [];

  for (const table of tables) {
    const lines = taken.filter((one) => one.table === table).flatMap((one) => one.lines);
    const before = counted[table] ?? { files: 0, rows: 0 };
    const entries = entriesOf(lines);

    const written =
      entries.length === 0 && before.files === 0 && finished.includes(table)
        ? [new Uint8Array(0)]
        : entries;

    written.forEach((bytes, at) => {
      files.push({ name: `${root}/${recordPath(table, before.files + at + 1)}`, bytes });
    });
    counted[table] = { files: before.files + written.length, rows: before.rows + lines.length };
  }

  return { files, tally: { ...tally, tables: counted } };
}

function streamPosition(stream: string): number | null {
  if (stream === "") return 0;

  const at = STREAMS.indexOf(stream);

  return at === -1 ? null : at;
}

function rowsToRead({ bytes, perRow }: Readonly<Pick<Progress, "bytes" | "perRow">>): number {
  if (perRow === 0) return FIRST_PAGE_ROWS;

  return Math.min(
    EXPORT_PAGE_ROWS,
    Math.max(FIRST_PAGE_ROWS, Math.ceil((EXPORT_SLICE_BYTES - bytes) / perRow) + 1),
  );
}

async function takeRows(db: Database, progress: Readonly<Progress>): Promise<Progress> {
  const table = STREAMS[progress.position] ?? "";

  const page = await tablePage(db, table, {
    after: progress.cursor,
    limit: rowsToRead(progress),
    budget: EXPORT_SLICE_BYTES - progress.bytes,
  });

  const taken = takenFrom(table, page.rows);

  const open =
    table === "items" && page.rows.length > 0
      ? await openItemCount(db, { first: page.first, last: page.last })
      : 0;

  return {
    ...progress,
    position: page.done ? progress.position + 1 : progress.position,
    cursor: page.done ? 0 : page.last,
    bytes: progress.bytes + sizeOf(taken),
    openItems: progress.openItems + open,
    perRow: page.done ? 0 : Math.ceil(sizeOf(taken) / page.rows.length),
    taken: [...progress.taken, taken],
    finished: page.done ? [...progress.finished, table] : progress.finished,
  };
}

async function takeItemFiles(
  ports: Readonly<Pick<Ports, "db" | "files">>,
  { root, progress }: Readonly<{ root: string; progress: Progress }>,
): Promise<Progress> {
  const taken = await takeItems(ports, {
    root,
    after: progress.cursor,
    resume: progress.partial,
    limit: EXPORT_SLICE_ITEMS - progress.itemCount,
    used: progress.bytes,
  });

  return {
    ...progress,
    position: taken.done ? progress.position + 1 : progress.position,
    cursor: taken.done ? 0 : taken.last,
    bytes: taken.files.reduce((sum, { bytes }) => sum + bytes.length, progress.bytes),
    itemFiles: [...progress.itemFiles, ...taken.files],
    itemCount: progress.itemCount + taken.count,
    partial: taken.partial,
    full: taken.full,
  };
}

function hasRoom({ position, bytes, itemCount, full }: Readonly<Progress>): boolean {
  return (
    position < STREAMS.length &&
    bytes < EXPORT_SLICE_BYTES &&
    itemCount < EXPORT_SLICE_ITEMS &&
    !full
  );
}

async function fill(
  ports: Readonly<Pick<Ports, "db" | "files">>,
  { root, progress }: Readonly<{ root: string; progress: Progress }>,
): Promise<Progress> {
  if (!hasRoom(progress)) return progress;

  const next =
    STREAMS[progress.position] === ITEM_FILES_STREAM
      ? await takeItemFiles(ports, { root, progress })
      : await takeRows(ports.db, progress);

  return fill(ports, { root, progress: next });
}

function startOf({
  position,
  cursor,
  partial,
}: Readonly<Pick<Progress, "position" | "cursor" | "partial">>): Progress {
  return {
    position,
    cursor,
    partial,
    bytes: 0,
    openItems: 0,
    perRow: 0,
    taken: [],
    finished: [],
    itemFiles: [],
    itemCount: 0,
    full: false,
  };
}

export interface BuiltSlice {
  readonly files: readonly ZipFile[];
  readonly stream: string;
  readonly cursor: number;
  readonly tally: ExportTally;
  readonly finished: boolean;
}

export async function buildSlice(
  ports: Readonly<Pick<Ports, "db" | "files">>,
  run: Readonly<Pick<ExportRow, "createdAt" | "stream" | "cursor" | "tally">>,
): Promise<BuiltSlice | null> {
  const { db } = ports;
  const root = exportRootName(run.createdAt);
  const before = ExportTallySchema.parse(JSON.parse(run.tally));
  const position = streamPosition(run.stream);

  if (position === null || (before.list !== "" && before.list !== STREAM_LIST)) return null;

  const progress = await fill(ports, {
    root,
    progress: startOf({ position, cursor: run.cursor, partial: before.partial }),
  });

  const { files, tally } = recordFiles(root, before, progress);

  const counted = {
    ...tally,
    list: STREAM_LIST,
    openItems: tally.openItems + progress.openItems,
    partial: progress.partial,
  };

  const finished = progress.position >= STREAMS.length;

  return {
    files: [
      ...files,
      ...progress.itemFiles,
      ...(finished ? [await manifestFile(db, { createdAt: run.createdAt, tally: counted })] : []),
    ],
    stream: STREAMS[progress.position] ?? "",
    cursor: progress.cursor,
    tally: counted,
    finished,
  };
}
