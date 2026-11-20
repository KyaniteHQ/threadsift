import { sql } from "drizzle-orm";

import type { JobOutcome, JobPorts } from "./job-outcome.ts";
import { readManifest } from "./restore-check.ts";
import {
  type Cursor,
  CursorSchema,
  RESTORE_BIND_BYTES,
  RESTORE_LINE_BYTES,
  RESTORE_UNIT_BYTES,
  RESTORE_UNIT_LINES,
  entering,
} from "./restore-contract.ts";
import { writingRows } from "./restore-hold.ts";
import { type Lines, completeLines } from "./restore-lines.ts";
import { RESTORE_ORDER } from "./restore-registry.ts";
import { insertRows, knownTable } from "./restore-rows.ts";
import { readRestoreDirectory } from "./restore-source.ts";
import { continuation, precondition, steppedUnit, tallied } from "./restore-unit.ts";
import type { RestoreRow } from "./schema.ts";
import { type ZipSource, bytesAt, entrySpan } from "./zip-read.ts";

interface Opened {
  readonly file: number;
  readonly entry: NonNullable<Cursor["entry"]>;
  readonly offset: number;
  readonly line: number;
}

export async function recordFiles(source: Readonly<ZipSource>) {
  const directory = await readRestoreDirectory(source);
  const manifest = await readManifest(source, directory);

  const files = RESTORE_ORDER.flatMap((table) => {
    const listed = manifest.tables[table];

    return listed === undefined || listed.rows === 0
      ? []
      : listed.files.map((file) => ({ table, name: `${directory.root}/${file}` }));
  });

  return { directory, files, manifest };
}

async function opened(
  source: Readonly<ZipSource>,
  cursor: Readonly<Cursor>,
): Promise<Opened | null> {
  const { entry } = cursor;

  if (entry !== null && cursor.offset < entry.size) {
    return { file: cursor.file, entry, offset: cursor.offset, line: cursor.line };
  }

  const file = entry === null ? cursor.file : cursor.file + 1;
  const { directory, files } = await recordFiles(source);
  const listed = files[file];

  if (listed === undefined) return null;

  const found = directory.entries.find(({ name }) => name === listed.name);

  if (found === undefined) throw new Error("A record file of the zip is missing");

  const next = {
    file,
    entry: {
      table: listed.table,
      start: (await entrySpan(source, directory, found)).start,
      size: found.size,
    },
    offset: 0,
    line: 0,
  };

  return found.size === 0 ? opened(source, next) : next;
}

async function windowLines(
  source: Readonly<ZipSource>,
  { entry, offset }: Readonly<Pick<Opened, "entry" | "offset">>,
  length: number = Math.min(RESTORE_UNIT_BYTES, entry.size - offset),
): Promise<Lines> {
  const window = await bytesAt(source, entry.start + offset, length);
  const final = offset + length >= entry.size;

  const found = completeLines(window, {
    final,
    limit: RESTORE_UNIT_LINES,
    bytes: RESTORE_BIND_BYTES,
  });

  if (found.lines.length > 0 || final) return found;

  if (length >= RESTORE_LINE_BYTES)
    throw new Error("A record line is longer than the format allows");

  return windowLines(source, { entry, offset }, Math.min(length * 2, entry.size - offset));
}

export async function tablesUnit(
  ports: JobPorts,
  run: Readonly<RestoreRow>,
  source: Readonly<ZipSource>,
): Promise<JobOutcome> {
  const { db } = ports;
  const cursor = CursorSchema.parse(JSON.parse(run.cursor));
  const at = await opened(source, cursor);

  if (at === null) {
    return steppedUnit(db, run, entering("files"));
  }

  const spec = knownTable(at.entry.table);

  const { lines, consumed } = await windowLines(source, at);

  const next: Cursor = {
    file: at.file,
    entry: at.entry,
    offset: at.offset + consumed,
    line: at.line + lines.length,
  };

  return {
    writes: writingRows(db, run.id, insertRows(db, spec, lines), {
      cursor: JSON.stringify(next),
      restored: tallied("restored", spec.name, sql`changes()`),
      dropped: tallied("dropped", spec.name, sql`${lines.length} - changes()`),
      updatedAt: Date.now(),
    }),
    precondition: precondition(db, run),
    continuation: continuation(db, run),
  };
}
