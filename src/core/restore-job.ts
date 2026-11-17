import type { ClaimedRestore, JobHandler, JobOutcome, JobPorts } from "./job-outcome.ts";
import { unownedRun } from "./job-rows.ts";
import { restoreClosing } from "./restore-closing.ts";
import { RESTORE_UNIT_DEADLINE_MS } from "./restore-contract.ts";
import { phaseUnit } from "./restore-phase.ts";
import { partSource } from "./restore-source.ts";
import { restoreById } from "./restore-state.ts";

async function attemptUnit(ports: JobPorts, job: Readonly<ClaimedRestore>): Promise<JobOutcome> {
  const run = await unownedRun("restore", job.address, (id) => restoreById(ports.db, id));

  return run?.state === "running"
    ? phaseUnit(ports, run, partSource(ports.files, run))
    : { writes: [] };
}

export const restoreHandler: JobHandler<ClaimedRestore> = {
  deadlineMs: RESTORE_UNIT_DEADLINE_MS,
  blockedBy: [],
  attempt: attemptUnit,
  ...restoreClosing,
};
