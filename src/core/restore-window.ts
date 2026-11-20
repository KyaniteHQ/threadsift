import { readManifest } from "./restore-check.ts";
import {
  type Cursor,
  RESTORE_BIND_BYTES,
  RESTORE_LINE_BYTES,
  RESTORE_UNIT_BYTES,
  RESTORE_UNIT_LINES,
} from "./restore-contract.ts";
import { type Lines, completeLines } from "./restore-lines.ts";
import { RESTORE_ORDER } from "./restore-registry.ts";
import { readRestoreDirectory } from "./restore-source.ts";
import { type ZipSource, bytesAt, entryStart } from "./zip-read.ts";

export interface Opened {
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

export async function opened(
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
      start: await entryStart(source, directory, found),
      size: found.size,
    },
    offset: 0,
    line: 0,
  };

  return found.size === 0 ? opened(source, next) : next;
}

export async function windowLines(
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
