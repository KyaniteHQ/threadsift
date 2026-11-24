import { z } from "zod";

import { RUNNING_RESTORE_PHASES } from "../../../core/contract/restore-contract.ts";
import type { JobOutcome, JobPorts } from "../../../core/kernel/job-outcome.ts";
import type { RestoreRow } from "../../../core/kernel/schema.ts";
import type { ZipSource } from "../../export/core/zip-read.ts";
import { checkUnit, verifiedRelease } from "./restore-check-unit.ts";
import { filesUnit } from "./restore-files.ts";
import { finishUnit } from "./restore-finish.ts";
import { highlightsUnit } from "./restore-highlights.ts";
import { tablesUnit } from "./restore-records.ts";
import { searchUnit } from "./restore-search.ts";
import type { Release } from "./restore-source.ts";
import { undoUnit } from "./restore-undo.ts";

const RunningPhaseSchema = z.enum(RUNNING_RESTORE_PHASES);

async function afterRelease(
  ports: JobPorts,
  run: Readonly<RestoreRow>,
  source: Readonly<ZipSource>,
  unit: (release: Readonly<Release>) => JobOutcome | Promise<JobOutcome>,
): Promise<JobOutcome> {
  const checked = await verifiedRelease(ports, run, source);

  return checked.kind === "refused" ? checked.outcome : unit(checked.release);
}

export function phaseUnit(
  ports: JobPorts,
  run: Readonly<RestoreRow>,
  source: Readonly<ZipSource>,
): Promise<JobOutcome> {
  const phase = RunningPhaseSchema.parse(run.phase);

  switch (phase) {
    case "check":
      return checkUnit(ports, run, source);
    case "tables":
      return tablesUnit(ports, run, source);
    case "files":
      return afterRelease(ports, run, source, (release) => filesUnit(ports, run, source, release));
    case "search":
      return searchUnit(ports, run);
    case "highlights":
      return highlightsUnit(ports, run);
    case "finish":
      return afterRelease(ports, run, source, (release) => finishUnit(ports, run, release));
    case "undoing":
      return undoUnit(ports, run);
    default:
      return phase satisfies never;
  }
}
