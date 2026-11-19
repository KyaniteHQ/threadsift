import type { FileStore } from "./file-store.ts";
import type { JobOutcome, JobPorts } from "./job-outcome.ts";
import {
  FilesCursorSchema,
  MISSING_FILES,
  RESTORED_FILES,
  START_ITEMS,
} from "./restore-contract.ts";
import { namedAfter, windowOf } from "./restore-file-window.ts";
import { tallied } from "./restore-tally.ts";
import { steppedUnit } from "./restore-unit.ts";
import { type RestoreRow, restoreRuns } from "./schema.ts";
import { readDirectory } from "./zip-directory.ts";
import { type ReadEntry, type ZipDirectory, type ZipSource, entriesBytes } from "./zip-read.ts";

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
  const directory = await readDirectory(source);
  const window = windowOf(directory, rows);

  if (window === null) {
    return steppedUnit(db, run, { phase: "search", cursor: JSON.stringify(START_ITEMS) });
  }

  await putEach(files, directory, await entriesBytes(source, directory, window.stored));

  return steppedUnit(db, run, {
    cursor: JSON.stringify(window.last),
    restored: tallied(restoreRuns.restored, RESTORED_FILES, window.stored.length),
    dropped: tallied(restoreRuns.dropped, MISSING_FILES, window.missing),
  });
}
