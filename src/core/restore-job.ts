import type { ClaimedRestore, JobHandler, JobOutcome, JobPorts } from "./job-outcome.ts";
import { unownedRun } from "./job-rows.ts";
import { checkUnit } from "./restore-check-unit.ts";
import { restoreClosing } from "./restore-closing.ts";
import { RESTORE_UNIT_DEADLINE_MS } from "./restore-contract.ts";
import { tablesUnit } from "./restore-copy.ts";
import { finishUnit } from "./restore-finish.ts";
import { partSource } from "./restore-source.ts";
import { restoreById } from "./restore-state.ts";
import { undoUnit } from "./restore-undo.ts";

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
    case "undoing":
      return undoUnit(ports, run);
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
  ...restoreClosing,
};
