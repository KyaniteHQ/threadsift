import { and, desc, eq, ne, sql } from "drizzle-orm";

import { removeExport, removeQuietly } from "./export-cleanup.ts";
import { type ExportStatus, NO_TALLY, exportDay } from "./export-contract.ts";
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

async function latestExport(db: JobPorts["db"]): Promise<ExportRow | null> {
  const [latest] = await db
    .select()
    .from(exportRuns)
    .where(
      and(
        ne(exportRuns.state, "expired"),
        sql`not (${exportRuns.state} = 'failed' and ${exportRuns.failure} = 'cancelled')`,
      ),
    )
    .orderBy(desc(exportRuns.id))
    .limit(1);

  return latest ?? null;
}

export async function startExport(ports: JobPorts): Promise<StartedExport> {
  const { db } = ports;
  const live = await latestExport(db);

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

export async function exportStatus(db: JobPorts["db"]): Promise<ExportStatus> {
  const run = await latestExport(db);

  if (run === null) return { state: "none" };

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
    case "failed":
      return { state: "failed", id, createdAt, failure: run.failure ?? "gave-up" };
    case "expired":
      return { state: "none" };
    default:
      return run.state satisfies never;
  }
}

export type DeletedExport = "deleted" | "none";

export async function deleteExport(ports: JobPorts): Promise<DeletedExport> {
  const { db } = ports;
  const run = await latestExport(db);

  if (run === null) return "none";

  if (run.state === "running") {
    await db.batch([
      db
        .update(exportRuns)
        .set({ state: "failed", failure: "cancelled", updatedAt: Date.now() })
        .where(and(eq(exportRuns.id, run.id), eq(exportRuns.state, "running"))),
      db
        .update(jobs)
        .set(CLOSED_JOB)
        .where(and(eq(jobs.kind, "export"), eq(jobs.address, exportAddress(run.id)))),
    ]);

    return "deleted";
  }

  await removeExport(ports, run.id);

  return "deleted";
}

export interface ReadyExport {
  readonly keys: readonly string[];
  readonly size: number;
  readonly filename: string;
}

export async function readyExport(db: JobPorts["db"], id: number): Promise<ReadyExport | null> {
  const [run] = await db
    .select()
    .from(exportRuns)
    .where(and(eq(exportRuns.id, id), eq(exportRuns.state, "ready")));

  if (run === undefined) return null;

  const numbered = (name: string) =>
    Array.from({ length: run.parts }, (_, at) =>
      exportFileKey(run.id, `${name}-${String(at + 1)}`),
    );

  return {
    keys: [...numbered("part"), ...numbered("dir"), exportFileKey(run.id, "tail")],
    size: run.dataBytes + run.dirBytes + run.tailBytes,
    filename: `threadsift-${exportDay(run.createdAt)}.zip`,
  };
}
