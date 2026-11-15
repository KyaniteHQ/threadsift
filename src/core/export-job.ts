import { type SQLWrapper, and, eq, exists, ne, sql } from "drizzle-orm";

import { type BuiltSlice, buildSlice } from "./export-slice.ts";
import { report } from "./failure-log.ts";
import { exportFileKey } from "./file-keys.ts";
import type { ClaimedExport, JobHandler, JobOutcome, JobPorts } from "./job-outcome.ts";
import { enqueueRows } from "./job-rows.ts";
import type { Database } from "./ports.ts";
import { type ExportRow, exportRuns, jobs } from "./schema.ts";
import { dosTimeOf, endOfArchive, packFiles } from "./zip.ts";

const SLICE_DEADLINE_MS = 600_000;

const ADDRESS = /^exports\/(?<id>[1-9][0-9]{0,18})$/u;

export function exportAddress(exportId: number): string {
  return `exports/${String(exportId)}`;
}

function exportIdOf(address: string): number | null {
  const id = ADDRESS.exec(address)?.groups?.["id"];

  return id === undefined ? null : Number(id);
}

export function openingExportJob(db: Database, scope: Readonly<SQLWrapper>) {
  return db
    .insert(jobs)
    .select(
      db
        .select({
          id: sql<null>`null`.as("id"),
          kind: sql<"export">`'export'`.as("kind"),
          itemId: sql<null>`null`.as("item_id"),
          address: sql<string>`'exports/' || ${exportRuns.id}`.as("address"),
          state: sql<"queued">`'queued'`.as("state"),
          attempts: sql<number>`0`.as("attempts"),
          staleRequeues: sql<number>`0`.as("stale_requeues"),
          attemptGeneration: sql<null>`null`.as("attempt_generation"),
          nextAttemptAt: sql<number>`${Date.now()}`.as("next_attempt_at"),
          claimExpires: sql<null>`null`.as("claim_expires"),
          waitReason: sql<null>`null`.as("wait_reason"),
          page: sql<null>`null`.as("page"),
        })
        .from(exportRuns)
        .where(sql`${scope}`),
    )
    .returning({ id: jobs.id });
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

function packedSlice(run: Readonly<ExportRow>, slice: Readonly<BuiltSlice>): PackedSlice {
  const packed = packFiles(slice.files, { offset: run.dataBytes, dos: dosTimeOf(run.createdAt) });
  const part = String(run.parts + 1);
  const entries = run.entries + slice.files.length;
  const dataBytes = run.dataBytes + packed.data.length;
  const dirBytes = run.dirBytes + packed.directory.length;

  const tail = slice.finished
    ? endOfArchive({ entries, directoryOffset: dataBytes, directorySize: dirBytes })
    : null;

  return {
    objects: [
      { key: exportFileKey(run.id, `part-${part}`), bytes: packed.data },
      { key: exportFileKey(run.id, `dir-${part}`), bytes: packed.directory },
      ...(tail === null ? [] : [{ key: exportFileKey(run.id, "tail"), bytes: tail }]),
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

async function runOf(db: Database, address: string): Promise<ExportRow | null> {
  const exportId = exportIdOf(address);

  if (exportId === null) return null;

  const [run] = await db.select().from(exportRuns).where(eq(exportRuns.id, exportId));

  return run ?? null;
}

async function attemptSlice(ports: JobPorts, job: Readonly<ClaimedExport>): Promise<JobOutcome> {
  const { db, files } = ports;
  const run = await runOf(db, job.address);

  if (run?.state !== "running") return { writes: [] };

  const started = performance.now();
  const slice = await buildSlice(db, run);
  const packed = packedSlice(run, slice);

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

export const exportHandler: JobHandler<ClaimedExport> = {
  deadlineMs: SLICE_DEADLINE_MS,
  blockedBy: [],
  attempt: attemptSlice,
  exhausted: (db, job) => {
    const exportId = exportIdOf(job.address);

    return exportId === null
      ? []
      : [
          db
            .update(exportRuns)
            .set({ state: "failed", failure: "gave-up", updatedAt: Date.now() })
            .where(and(eq(exportRuns.id, exportId), eq(exportRuns.state, "running"))),
        ];
  },
  afterClosed: async (ports, job, closed) => {
    if (!closed) return;

    await enqueueRows(
      ports,
      await ports.db
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.kind, "export"), eq(jobs.address, job.address), ne(jobs.state, "done"))),
    );
  },
};
