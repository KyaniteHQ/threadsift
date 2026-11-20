import { sql } from "drizzle-orm";

import { itemFileOf } from "../../../core/contract/file-keys.ts";
import { IMAGE_MAX_BYTES, ITEM_REQUEST_BYTES } from "../../../core/contract/limits.ts";
import {
  FilesCursorSchema,
  MISSING_FILES,
  RESTORED_FILES,
  RESTORE_FILE_BYTES,
  RESTORE_FILE_ENTRIES,
  entering,
} from "../../../core/contract/restore-contract.ts";
import type { Database } from "../../../core/kernel/database.ts";
import type { FileStore } from "../../../core/kernel/file-store.ts";
import type { JobOutcome, JobPorts } from "../../../core/kernel/job-outcome.ts";
import type { RestoreRow } from "../../../core/kernel/schema.ts";
import {
  type ReadEntry,
  type ReadExtent,
  type ZipDirectory,
  type ZipEntry,
  type ZipSource,
  entriesBytes,
  extentWith,
} from "../../export/core/zip-read.ts";
import { NAMED_FILES } from "./named-files.ts";
import { readRestoreDirectory } from "./restore-source.ts";
import { steppedUnit, tallied } from "./restore-unit.ts";

const ITEM_FILE_BYTES = {
  image: IMAGE_MAX_BYTES,
  "post-text": ITEM_REQUEST_BYTES,
} as const;

interface Named {
  readonly owner: number;
  readonly key: string;
}

interface Batch {
  readonly stored: readonly ZipEntry[];
  readonly missing: number;
  readonly last: Named;
}

function namedAfter(db: Database, after: Readonly<Named>) {
  return db
    .select({ key: sql<string>`named.key`, owner: sql<number>`named.owner` })
    .from(sql`${NAMED_FILES} as named`)
    .where(sql`(named.owner, named.key) > (${after.owner}, ${after.key})`)
    .orderBy(sql`named.owner, named.key`)
    .limit(RESTORE_FILE_ENTRIES);
}

function restorable(
  directory: Readonly<ZipDirectory>,
  entries: Readonly<ReadonlyMap<string, Readonly<ZipEntry>>>,
  { owner, key }: Readonly<Named>,
): ZipEntry | null {
  const entry = entries.get(`${directory.root}/${key}`);
  const file = itemFileOf(key);

  if (entry === undefined || file === null || file.itemId !== String(owner)) return null;

  return entry.size > ITEM_FILE_BYTES[file.kind] ? null : entry;
}

function windowOf(
  directory: Readonly<ZipDirectory>,
  rows: readonly Readonly<Named>[],
): Batch | null {
  const entries = new Map(directory.entries.map((entry) => [entry.name, entry]));
  const stored: ZipEntry[] = [];
  let missing = 0;
  let last: Named | null = null;
  let extent: ReadExtent | null = null;

  for (const row of rows) {
    const entry = restorable(directory, entries, row);

    if (entry === null) {
      missing += 1;
    } else {
      const next = extentWith(extent, entry);

      if (stored.length > 0 && next.to - next.from > RESTORE_FILE_BYTES) break;

      stored.push(entry);
      extent = next;
    }

    last = row;
  }

  return last === null ? null : { stored, missing, last };
}

function putEach(
  store: FileStore,
  directory: Readonly<ZipDirectory>,
  read: readonly Readonly<ReadEntry>[],
): Promise<void> {
  return read.reduce(
    (previous, { entry, bytes }) =>
      previous.then(() => store.put(entry.name.slice(directory.root.length + 1), bytes)),
    Promise.resolve(),
  );
}

export async function filesUnit(
  { db, files }: JobPorts,
  run: Readonly<RestoreRow>,
  source: Readonly<ZipSource>,
): Promise<JobOutcome> {
  const after = FilesCursorSchema.parse(JSON.parse(run.cursor));
  const rows = await namedAfter(db, after);
  const directory = await readRestoreDirectory(source);
  const window = windowOf(directory, rows);

  if (window === null) {
    return steppedUnit(db, run, entering("search"));
  }

  await putEach(files, directory, await entriesBytes(source, directory, window.stored));

  return steppedUnit(db, run, {
    cursor: JSON.stringify(window.last),
    restored: tallied("restored", RESTORED_FILES, window.stored.length),
    dropped: tallied("dropped", MISSING_FILES, window.missing),
  });
}
