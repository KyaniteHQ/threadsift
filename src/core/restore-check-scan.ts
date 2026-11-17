import { crc32 } from "./crc32.ts";
import { recordTableOf } from "./export-manifest.ts";
import { type Manifest, refused } from "./restore-check.ts";
import { type CheckCursor, RESTORE_CHECK_BYTES, RESTORE_LINE_BYTES } from "./restore-contract.ts";
import { completeLines, parsedRow } from "./restore-lines.ts";
import { type TableSpec, lineVerdict, tableSpec } from "./restore-registry.ts";
import {
  type ZipDirectory,
  type ZipEntry,
  ZipRefused,
  type ZipSource,
  bytesAt,
  entryStart,
  localDataStart,
} from "./zip-read.ts";

interface Region {
  readonly bytes: Uint8Array;
  readonly base: number;
}

export interface Env {
  readonly source: Readonly<ZipSource>;
  readonly directory: Readonly<ZipDirectory>;
  readonly manifest: Readonly<Manifest>;
}

function recordSpec(
  { directory }: Readonly<Env>,
  { name }: Readonly<ZipEntry>,
): TableSpec | undefined {
  const table = recordTableOf(directory, name);

  return table === null ? undefined : tableSpec(table);
}

function lineRefusal(
  spec: Readonly<TableSpec>,
  line: Uint8Array,
  number: number,
): ZipRefused | null {
  const where = `line ${String(number)} of a record file of the table ${spec.name}`;
  const row = parsedRow(line);

  if (row === null || line.length > RESTORE_LINE_BYTES) {
    return refused("format", `The ${where} is not a record that fits the table`);
  }

  const verdict = lineVerdict(spec, row);

  return verdict === "valid" ? null : refused(verdict, `The ${where} does not match the table`);
}

function scanned(
  env: Readonly<Env>,
  entry: Readonly<ZipEntry>,
  data: Uint8Array,
  at: Readonly<CheckCursor>,
): CheckCursor {
  const final = at.offset + data.length >= entry.size;
  const spec = recordSpec(env, entry);

  if (spec === undefined) {
    return { ...at, offset: at.offset + data.length, crc: crc32(data, at.crc) };
  }

  const { lines, consumed } = completeLines(data, {
    final,
    limit: Number.POSITIVE_INFINITY,
    bytes: Number.POSITIVE_INFINITY,
  });

  if (consumed === 0 && !final && data.length >= RESTORE_LINE_BYTES) {
    throw refused("format", `A line of a record file of the table ${spec.name} is too long`);
  }

  for (const [position, line] of lines.entries()) {
    const refusal = lineRefusal(spec, line, at.line + position + 1);

    if (refusal !== null) throw refusal;
  }

  return {
    ...at,
    offset: at.offset + consumed,
    line: at.line + lines.length,
    crc: crc32(data.subarray(0, consumed), at.crc),
  };
}

function finished(
  env: Readonly<Env>,
  entry: Readonly<ZipEntry>,
  at: Readonly<CheckCursor>,
): CheckCursor {
  if (at.crc !== entry.crc) {
    throw refused("crc", "An entry of the zip does not match its checksum");
  }

  const spec = recordSpec(env, entry);

  const rows =
    spec === undefined ? at.rows : { ...at.rows, [spec.name]: (at.rows[spec.name] ?? 0) + at.line };

  return { entry: at.entry + 1, offset: 0, line: 0, crc: 0, rows };
}

function dataStart(bytes: Uint8Array, at: number, entry: Readonly<ZipEntry>): number | null {
  const start = localDataStart(bytes, at, entry);

  return start === null || start > bytes.length ? null : start;
}

function dataIn(
  env: Readonly<Env>,
  { bytes, base }: Readonly<Region>,
  entry: Readonly<ZipEntry>,
  offset: number,
): Uint8Array | null {
  const from = offset === 0 ? dataStart(bytes, entry.headerOffset - base, entry) : 0;

  if (from === null) return null;

  if (base + from + entry.size - offset > env.directory.offset) {
    throw new ZipRefused("not-a-zip", "An entry of the zip runs past its end");
  }

  return bytes.subarray(from, from + entry.size - offset);
}

function walk(
  env: Readonly<Env>,
  region: Readonly<Region>,
  start: Readonly<CheckCursor>,
): CheckCursor {
  let at = start;

  for (
    let entry = env.directory.entries[at.entry];
    entry !== undefined;
    entry = env.directory.entries[at.entry]
  ) {
    const data = dataIn(env, region, entry, at.offset);

    if (data === null) break;

    const step = scanned(env, entry, data, at);

    if (step.offset < entry.size) {
      at = step;
      break;
    }

    at = finished(env, entry, step);
  }

  return at;
}

export async function advance(env: Readonly<Env>, at: Readonly<CheckCursor>): Promise<CheckCursor> {
  const first = env.directory.entries[at.entry];

  if (first === undefined) return at;

  const base =
    at.offset === 0
      ? first.headerOffset
      : (await entryStart(env.source, env.directory, first)) + at.offset;

  const bytes = await bytesAt(
    env.source,
    base,
    Math.min(RESTORE_CHECK_BYTES, env.directory.offset - base),
  );

  return walk(env, { bytes, base }, at);
}

export function rowsMatch({ manifest }: Readonly<Env>, counted: CheckCursor["rows"]): void {
  const same = Object.entries(manifest.tables).every(
    ([table, { rows }]) => (counted[table] ?? 0) === rows,
  );

  if (!same) {
    throw refused(
      "format",
      "The record files of a table hold another number of rows than the manifest says",
    );
  }
}
