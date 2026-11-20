import { crc32 } from "./crc32.ts";
import { type Manifest, recordTableOf } from "./export-format.ts";
import { type CheckCursor, RESTORE_CHECK_BYTES, RESTORE_LINE_BYTES } from "./restore-contract.ts";
import { completeLines, parsedRow } from "./restore-lines.ts";
import { RestoreRefused } from "./restore-refusal.ts";
import { type TableSpec, lineVerdict, tableSpec } from "./restore-registry.ts";
import {
  type ZipDirectory,
  type ZipEntry,
  type ZipRegion,
  type ZipSource,
  bytesAt,
  checkedCrc,
  entrySpan,
  spanIn,
} from "./zip-read.ts";

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
): RestoreRefused | null {
  const where = `line ${String(number)} of a record file of the table ${spec.name}`;
  const row = parsedRow(line);

  if (row === null || line.length > RESTORE_LINE_BYTES) {
    return new RestoreRefused("format", `The ${where} is not a record that fits the table`);
  }

  const verdict = lineVerdict(spec, row);

  return verdict === "valid"
    ? null
    : new RestoreRefused(verdict, `The ${where} does not match the table`);
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
    throw new RestoreRefused(
      "format",
      `A line of a record file of the table ${spec.name} is too long`,
    );
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
  checkedCrc(entry, at.crc);

  const spec = recordSpec(env, entry);

  const rows =
    spec === undefined ? at.rows : { ...at.rows, [spec.name]: (at.rows[spec.name] ?? 0) + at.line };

  return { entry: at.entry + 1, offset: 0, line: 0, crc: 0, rows };
}

function dataIn(
  env: Readonly<Env>,
  region: Readonly<ZipRegion>,
  entry: Readonly<ZipEntry>,
  offset: number,
): Uint8Array | null {
  const span = spanIn(region, env.directory, entry, offset);

  return span === null
    ? null
    : region.bytes.subarray(span.start - region.base, span.end - region.base);
}

function walk(
  env: Readonly<Env>,
  region: Readonly<ZipRegion>,
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
      : (await entrySpan(env.source, env.directory, first)).start + at.offset;

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
    throw new RestoreRefused(
      "format",
      "The record files of a table hold another number of rows than the manifest says",
    );
  }
}
