import { and, desc, eq } from "drizzle-orm";

import type { Database } from "./database.ts";
import { removeExport, removeQuietly } from "./export-cleanup.ts";
import {
  type ExportStatus,
  ExportTallySchema,
  NO_TALLY,
  exportObjectName,
  exportRootName,
  exportTailName,
} from "./export-contract.ts";
import { exportAddress, openingExportJob } from "./export-job.ts";
import { exportFileKey } from "./file-keys.ts";
import { refusedBy } from "./guards.ts";
import { CLOSED_JOB } from "./job-close.ts";
import type { JobPorts } from "./job-outcome.ts";
import { enqueueRows } from "./job-rows.ts";
import { type ExportRow, exportRuns, jobs } from "./schema.ts";

const ONE_LIVE_EXPORT = /UNIQUE constraint failed: (?:index 'exports_one_live'|exports\.)/u;

export type StartedExport =
  | { readonly kind: "started"; readonly id: number }
  | { readonly kind: "running" };

async function newestExport(db: Database): Promise<ExportRow | null> {
  const [newest] = await db.select().from(exportRuns).orderBy(desc(exportRuns.id)).limit(1);

  return newest ?? null;
}

function shown(run: Readonly<ExportRow>): boolean {
  return (
    run.state === "running" ||
    run.state === "ready" ||
    (run.state === "failed" && run.failure !== "cancelled")
  );
}

export async function startExport(ports: JobPorts): Promise<StartedExport> {
  const { db } = ports;
  const live = await newestExport(db);

  if (live?.state === "running") return { kind: "running" };

  const now = Date.now();
  const replaced = live?.state === "ready" ? live.id : null;

  try {
    const [, [started], [opened]] = await db.batch([
      db
        .update(exportRuns)
        .set({ state: "failed", failure: "replaced", updatedAt: now })
        .where(eq(exportRuns.state, "ready")),
      db
        .insert(exportRuns)
        .values({
          state: "running",
          createdAt: now,
          updatedAt: now,
          tally: JSON.stringify(NO_TALLY),
        })
        .returning({ id: exportRuns.id }),
      openingExportJob(db, eq(exportRuns.state, "running")),
    ]);

    if (started === undefined || opened === undefined) {
      throw new Error("The export batch returned no row");
    }

    await enqueueRows(ports, [opened]);

    if (replaced !== null) await removeQuietly(ports, replaced);

    return { kind: "started", id: started.id };
  } catch (error) {
    if (refusedBy(error, ONE_LIVE_EXPORT)) return { kind: "running" };

    throw error;
  }
}

export async function exportStatus(db: Database): Promise<ExportStatus> {
  const run = await newestExport(db);

  if (run === null || !shown(run)) return { state: "none" };

  const { id, createdAt } = run;

  switch (run.state) {
    case "running":
      return {
        state: "running",
        id,
        createdAt,
        entries: run.entries,
        dataBytes: run.dataBytes,
        parts: run.parts,
      };
    case "ready":
      return {
        state: "ready",
        id,
        createdAt,
        finishedAt: run.finishedAt ?? run.updatedAt,
        entries: run.entries,
        dataBytes: run.dataBytes,
        parts: run.parts,
        zipBytes: run.dataBytes + run.dirBytes + run.tailBytes,
      };
    case "failed": {
      if (run.failure === null) throw new Error(`Export ${String(id)} failed with no reason`);

      return { state: "failed", id, createdAt, failure: run.failure };
    }

    case "removing":
    case "expired":
      return { state: "none" };
    default:
      return run.state satisfies never;
  }
}

export type DeletedExport = "deleted" | "none";

export async function deleteExport(ports: JobPorts): Promise<DeletedExport> {
  const { db } = ports;
  const run = await newestExport(db);

  if (run === null || !shown(run)) return "none";

  if (run.state === "running") {
    const [stopped] = await db.batch([
      db
        .update(exportRuns)
        .set({ state: "failed", failure: "cancelled", updatedAt: Date.now() })
        .where(and(eq(exportRuns.id, run.id), eq(exportRuns.state, "running")))
        .returning({ id: exportRuns.id }),
      db
        .update(jobs)
        .set(CLOSED_JOB)
        .where(and(eq(jobs.kind, "export"), eq(jobs.address, exportAddress(run.id)))),
    ]);

    if (stopped.length > 0) return "deleted";
  }

  await removeExport(ports, run.id);

  return "deleted";
}

export interface ReadyExport {
  readonly keys: readonly string[];
  readonly size: number;
  readonly filename: string;
}

export async function readyExport(db: Database, id: number): Promise<ReadyExport | null> {
  const [run] = await db
    .select()
    .from(exportRuns)
    .where(and(eq(exportRuns.id, id), eq(exportRuns.state, "ready")));

  if (run === undefined) return null;

  const { generations } = ExportTallySchema.parse(JSON.parse(run.tally));

  const tail = generations.at(-1);

  if (tail === undefined) return null;

  const named = (kind: "part" | "dir") =>
    generations.map((generation, at) =>
      exportFileKey(run.id, exportObjectName(kind, at + 1, generation)),
    );

  return {
    keys: [...named("part"), ...named("dir"), exportFileKey(run.id, exportTailName(tail))],
    size: run.dataBytes + run.dirBytes + run.tailBytes,
    filename: `${exportRootName(run.createdAt)}.zip`,
  };
}
