import { and, eq } from "drizzle-orm";

import { RESTORE_UNIT_DEADLINE_MS } from "../../../core/contract/restore-contract.ts";
import type { ClaimedRestore, JobOutcome, JobPorts } from "../../../core/kernel/job-outcome.ts";
import { unownedRun } from "../../../core/kernel/job-rows.ts";
import { defineUnownedJob } from "../../../core/kernel/job-spec.ts";
import { restoreRuns } from "../../../core/kernel/schema.ts";
import { phaseUnit } from "./restore-phase.ts";
import { partSource } from "./restore-source.ts";
import { restoreById } from "./restore-state.ts";

async function attemptUnit(ports: JobPorts, job: Readonly<ClaimedRestore>): Promise<JobOutcome> {
  const run = await unownedRun("restore", job.address, (id) => restoreById(ports.db, id));

  return run?.state === "running"
    ? phaseUnit(ports, run, partSource(ports.files, run))
    : { writes: [] };
}

export const restoreHandler = defineUnownedJob("restore", {
  deadlineMs: RESTORE_UNIT_DEADLINE_MS,
  attempt: attemptUnit,
  exhausted: (db, restoreId) => [
    db
      .update(restoreRuns)
      .set({ state: "failed", failure: "gave-up", updatedAt: Date.now() })
      .where(and(eq(restoreRuns.id, restoreId), eq(restoreRuns.state, "running"))),
  ],
});
