import { sql } from "drizzle-orm";

import {
  type Cursor,
  CursorSchema,
  RESTORE_BIND_BYTES,
  RESTORE_LINE_BYTES,
  RESTORE_UNIT_BYTES,
  RESTORE_UNIT_LINES,
  entering,
} from "../../../core/contract/restore-contract.ts";
import type { JobOutcome, JobPorts } from "../../../core/kernel/job-outcome.ts";
import type { RestoreRow } from "../../../core/kernel/schema.ts";
import { type ZipSource, bytesAt, entrySpan } from "../../export/core/zip-read.ts";
import { verifiedRelease } from "./restore-check-unit.ts";
import { type Lines, completeLines } from "./restore-lines.ts";
import { RESTORE_ORDER } from "./restore-registry.ts";
import { insertRows, knownTable } from "./restore-rows.ts";
import type { Release } from "./restore-source.ts";
import { steppedUnit, tallied } from "./restore-unit.ts";

interface Opened {
  readonly file: number;
  readonly entry: NonNullable<Cursor["entry"]>;
  readonly offset: number;
  readonly line: number;
}

function recordFiles({ directory, manifest }: Readonly<Release>) {
  return RESTORE_ORDER.flatMap((table) => {
    const listed = manifest.tables[table];

    return listed === undefined || listed.rows === 0
      ? []
      : listed.files.map((file) => ({ table, name: `${directory.root}/${file}` }));
  });
}

async function opened(
  source: Readonly<ZipSource>,
  cursor: Readonly<Cursor>,
  release: Readonly<Release>,
): Promise<Opened | null> {
  const { entry } = cursor;

  if (entry !== null && cursor.offset < entry.size) {
    return { file: cursor.file, entry, offset: cursor.offset, line: cursor.line };
  }

  const file = entry === null ? cursor.file : cursor.file + 1;
  const { directory } = release;
  const listed = recordFiles(release)[file];

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

  return found.size === 0 ? opened(source, next, release) : next;
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

type Opening =
  | { readonly kind: "opened"; readonly at: Opened | null }
  | { readonly kind: "refused"; readonly outcome: JobOutcome };

async function openingOf(
  ports: JobPorts,
  run: Readonly<RestoreRow>,
  source: Readonly<ZipSource>,
): Promise<Opening> {
  const checked = await verifiedRelease(ports, run, source);

  if (checked.kind === "refused") return checked;

  const cursor = CursorSchema.parse(JSON.parse(run.cursor));

  return { kind: "opened", at: await opened(source, cursor, checked.release) };
}

export async function tablesUnit(
  ports: JobPorts,
  run: Readonly<RestoreRow>,
  source: Readonly<ZipSource>,
): Promise<JobOutcome> {
  const { db } = ports;
  const opening = await openingOf(ports, run, source);

  if (opening.kind === "refused") return opening.outcome;

  const { at } = opening;

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

  return steppedUnit(
    db,
    run,
    {
      cursor: JSON.stringify(next),
      restored: tallied("restored", spec.name, sql`changes()`),
      dropped: tallied("dropped", spec.name, sql`${lines.length} - changes()`),
    },
    [insertRows(db, spec, lines)],
  );
}
