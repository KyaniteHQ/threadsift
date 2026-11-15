import { and, eq, sql } from "drizzle-orm";

import type { ClaimedRestore, JobHandler, JobOutcome, JobPorts } from "./job-outcome.ts";
import { enqueueRows, unownedOwnerId, unownedRun } from "./job-rows.ts";
import { checkUnit } from "./restore-check-unit.ts";
import { RESTORE_UNIT_DEADLINE_MS } from "./restore-contract.ts";
import { tablesUnit } from "./restore-copy.ts";
import { finishUnit } from "./restore-finish.ts";
import { partSource } from "./restore-source.ts";
import { restoreById } from "./restore-state.ts";
import { jobs, restoreRuns } from "./schema.ts";

async function attemptUnit(ports: JobPorts, job: Readonly<ClaimedRestore>): Promise<JobOutcome> {
  const run = await unownedRun("restore", job.address, (id) => restoreById(ports.db, id));

  if (run?.state !== "running") return { writes: [] };

  const source = partSource(ports.files, run);

  switch (run.phase) {
    case "check":
      return checkUnit(ports, run, source);
    case "tables":
      return tablesUnit(ports, run, source);
    case "finish":
      return finishUnit(ports, run, source);
    case "upload":
      throw new Error(`Restore ${String(run.id)} runs in its upload phase`);
    default:
      return run.phase satisfies never;
  }
}

export const restoreHandler: JobHandler<ClaimedRestore> = {
  deadlineMs: RESTORE_UNIT_DEADLINE_MS,
  blockedBy: [],
  attempt: attemptUnit,
  exhausted: (db, job) => {
    const restoreId = unownedOwnerId("restore", job.address);

    return restoreId === null
      ? []
      : [
          db
            .update(restoreRuns)
            .set({ state: "failed", failure: "gave-up", updatedAt: Date.now() })
            .where(and(eq(restoreRuns.id, restoreId), eq(restoreRuns.state, "running"))),
        ];
  },
  afterClosed: async (ports, job, closed) => {
    if (!closed) return;

    await enqueueRows(
      ports,
      await ports.db
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          and(
            eq(jobs.kind, "restore"),
            eq(jobs.address, job.address),
            sql`${jobs.state} <> 'done'`,
          ),
        ),
    );
  },
};
