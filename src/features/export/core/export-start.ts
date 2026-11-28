import { eq } from "drizzle-orm";

import { NO_TALLY } from "../../../core/contract/export-contract.ts";
import { refusedBy } from "../../../core/kernel/guards.ts";
import type { JobPorts } from "../../../core/kernel/job-outcome.ts";
import { enqueueRows } from "../../../core/kernel/job-rows.ts";
import { type Closed, restoreGuard, whileOpen } from "../../../core/kernel/restore-hold.ts";
import { exportRuns, guards } from "../../../core/kernel/schema.ts";
import { removeQuietly } from "./export-cleanup.ts";
import { openingExportJob } from "./export-job.ts";
import { newestExport } from "./export-run.ts";

const ONE_LIVE_EXPORT = /UNIQUE constraint failed: (?:index 'exports_one_live'|exports\.)/u;

type StartedExport =
  | { readonly kind: "started"; readonly id: number }
  | { readonly kind: "running" }
  | Closed;

async function started(ports: JobPorts, now: number): Promise<StartedExport> {
  const { db } = ports;

  try {
    const [, , [run], [opened]] = await db.batch([
      restoreGuard(db),
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
      db.delete(guards),
    ]);

    if (run === undefined || opened === undefined) {
      throw new Error("The export batch returned no row");
    }

    await enqueueRows(ports, [opened]);

    return { kind: "started", id: run.id };
  } catch (error) {
    if (refusedBy(error, ONE_LIVE_EXPORT)) return { kind: "running" };

    throw error;
  }
}

export async function startExport(ports: JobPorts): Promise<StartedExport> {
  const live = await newestExport(ports.db);

  if (live?.state === "running") return { kind: "running" };

  const outcome = await whileOpen(() => started(ports, Date.now()));

  if (outcome.kind === "started" && live?.state === "ready") await removeQuietly(ports, live.id);

  return outcome;
}
