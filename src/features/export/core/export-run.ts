import { and, desc, eq } from "drizzle-orm";

import { type ExportStatus, isShownFailure } from "../../../core/contract/export-contract.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { closeRunJobs } from "../../../core/kernel/job-close.ts";
import type { JobPorts } from "../../../core/kernel/job-outcome.ts";
import { type ExportRow, exportRuns } from "../../../core/kernel/schema.ts";
import { removeExport } from "./export-cleanup.ts";
import { exportRootName } from "./export-format.ts";
import { endedExport } from "./export-job.ts";
import { storedZip, zipSize } from "./export-zip.ts";

async function newestExport(db: Database): Promise<ExportRow | null> {
  const [newest] = await db.select().from(exportRuns).orderBy(desc(exportRuns.id)).limit(1);

  return newest ?? null;
}

function shown(run: Readonly<ExportRow>): boolean {
  return (
    run.state === "running" ||
    run.state === "ready" ||
    (run.state === "failed" && isShownFailure(run.failure))
  );
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
    case "ready": {
      if (run.finishedAt === null)
        throw new Error(`Export ${String(id)} is ready with no end time`);

      return {
        state: "ready",
        id,
        createdAt,
        finishedAt: run.finishedAt,
        entries: run.entries,
        dataBytes: run.dataBytes,
        parts: run.parts,
        zipBytes: zipSize(run),
      };
    }

    case "failed": {
      if (!isShownFailure(run.failure)) {
        throw new Error(`Export ${String(id)} failed with a reason the status never shows`);
      }

      return { state: "failed", id, createdAt, failure: run.failure };
    }

    case "removing":
    case "expired":
      return { state: "none" };
    default:
      return run.state satisfies never;
  }
}

type DeletedExport = "deleted" | "none";

export async function deleteExport(ports: JobPorts): Promise<DeletedExport> {
  const { db } = ports;
  const run = await newestExport(db);

  if (run === null || !shown(run)) return "none";

  if (run.state === "running") {
    const [stopped] = await db.batch([
      endedExport(db, eq(exportRuns.id, run.id), "cancelled").returning({ id: exportRuns.id }),
      closeRunJobs(db, "export", run.id),
    ]);

    if (stopped.length > 0) return "deleted";
  }

  await removeExport(ports, run.id);

  return "deleted";
}

interface ReadyExport {
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

  const stored = storedZip(run);

  return stored === null ? null : { ...stored, filename: `${exportRootName(run.createdAt)}.zip` };
}
