import { type SQLWrapper, and, eq, exists, sql } from "drizzle-orm";

import type { Database } from "./database.ts";
import {
  EXPORT_SLICE_DEADLINE_MS,
  type ExportFailure,
  exportObjectName,
  exportTailName,
} from "./export-contract.ts";
import { type BuiltSlice, buildSlice } from "./export-slice.ts";
import { report } from "./failure-log.ts";
import { exportFileKey } from "./file-keys.ts";
import type { ClaimedExport, JobOutcome, JobPorts } from "./job-outcome.ts";
import { openingUnowned, unownedRun } from "./job-rows.ts";
import { defineUnownedJob } from "./job-spec.ts";
import { type ExportRow, exportRuns } from "./schema.ts";
import { dosTimeOf, endOfArchive, packFiles } from "./zip.ts";

export function openingExportJob(db: Database, scope: Readonly<SQLWrapper>) {
  return openingUnowned(db, "export", exportRuns, scope);
}

function stillAt(db: Database, exportId: number, parts: number) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(exportRuns)
      .where(
        and(
          eq(exportRuns.id, exportId),
          eq(exportRuns.state, "running"),
          eq(exportRuns.parts, parts),
        ),
      ),
  );
}

interface PackedSlice {
  readonly objects: readonly Readonly<{ key: string; bytes: Uint8Array }>[];
  readonly entries: number;
  readonly dataBytes: number;
  readonly dirBytes: number;
  readonly tailBytes: number | null;
}

function packedSlice(
  run: Readonly<ExportRow>,
  slice: Readonly<BuiltSlice>,
  generation: number,
): PackedSlice {
  const packed = packFiles(slice.files, { offset: run.dataBytes, dos: dosTimeOf(run.createdAt) });
  const part = run.parts + 1;
  const entries = run.entries + slice.files.length;
  const dataBytes = run.dataBytes + packed.data.length;
  const dirBytes = run.dirBytes + packed.directory.length;

  const tail = slice.finished
    ? endOfArchive({ entries, directoryOffset: dataBytes, directorySize: dirBytes })
    : null;

  return {
    objects: [
      {
        key: exportFileKey(run.id, exportObjectName("part", part, generation)),
        bytes: packed.data,
      },
      {
        key: exportFileKey(run.id, exportObjectName("dir", part, generation)),
        bytes: packed.directory,
      },
      ...(tail === null
        ? []
        : [{ key: exportFileKey(run.id, exportTailName(generation)), bytes: tail }]),
    ],
    entries,
    dataBytes,
    dirBytes,
    tailBytes: tail?.length ?? null,
  };
}

function checkpoint(
  db: Database,
  run: Readonly<ExportRow>,
  slice: Readonly<BuiltSlice>,
  packed: Readonly<PackedSlice>,
) {
  const now = Date.now();

  const progress = {
    stream: slice.stream,
    cursor: slice.cursor,
    entries: packed.entries,
    dataBytes: packed.dataBytes,
    dirBytes: packed.dirBytes,
    parts: run.parts + 1,
    tally: JSON.stringify(slice.tally),
    updatedAt: now,
  };

  return db
    .update(exportRuns)
    .set(
      packed.tailBytes === null
        ? progress
        : { ...progress, state: "ready", finishedAt: now, tailBytes: packed.tailBytes },
    )
    .where(and(eq(exportRuns.id, run.id), eq(exportRuns.state, "running")));
}

function runOf(db: Database, address: string): Promise<ExportRow | null> {
  return unownedRun("export", address, async (id) => {
    const [run] = await db.select().from(exportRuns).where(eq(exportRuns.id, id));

    return run;
  });
}

function failure(db: Database, exportId: number, reason: ExportFailure) {
  return db
    .update(exportRuns)
    .set({ state: "failed", failure: reason, updatedAt: Date.now() })
    .where(and(eq(exportRuns.id, exportId), eq(exportRuns.state, "running")));
}

async function attemptSlice(ports: JobPorts, job: Readonly<ClaimedExport>): Promise<JobOutcome> {
  const { db, files } = ports;
  const run = await runOf(db, job.address);

  if (run?.state !== "running") return { writes: [] };

  const started = performance.now();
  const built = await buildSlice(ports, run);

  if (built === null) return { writes: [failure(db, run.id, "list-changed")] };

  const slice = {
    ...built,
    tally: { ...built.tally, generations: [...built.tally.generations, job.attempts] },
  };

  const packed = packedSlice(run, slice, job.attempts);

  await Promise.all(packed.objects.map(({ key, bytes }) => files.put(key, bytes)));

  report("export-slice", {
    exportId: run.id,
    slice: run.parts + 1,
    entries: slice.files.length,
    bytes: packed.dataBytes - run.dataBytes,
    ms: Math.round(performance.now() - started),
  });

  return {
    writes: [checkpoint(db, run, slice, packed)],
    files: { written: packed.objects.map(({ key }) => key), superseded: [] },
    continuation: slice.finished ? [] : [openingExportJob(db, eq(exportRuns.id, run.id))],
    precondition: {
      holds: stillAt(db, run.id, run.parts),
      rebuild: async () => {
        await files.delete(packed.objects.map(({ key }) => key));

        return { writes: [] };
      },
    },
  };
}

export const exportHandler = defineUnownedJob("export", {
  deadlineMs: EXPORT_SLICE_DEADLINE_MS,
  attempt: attemptSlice,
  exhausted: (db, exportId) => [failure(db, exportId, "gave-up")],
});
