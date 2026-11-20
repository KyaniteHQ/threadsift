import { z } from "zod";

import { RUNNING_RESTORE_PHASES } from "../contract/restore-contract.ts";
import type { ZipSource } from "../export/zip-read.ts";
import type { JobOutcome, JobPorts } from "../kernel/job-outcome.ts";
import type { RestoreRow } from "../kernel/schema.ts";
import { checkUnit } from "./restore-check-unit.ts";
import { filesUnit } from "./restore-files.ts";
import { finishUnit } from "./restore-finish.ts";
import { highlightsUnit } from "./restore-highlights.ts";
import { tablesUnit } from "./restore-records.ts";
import { searchUnit } from "./restore-search.ts";
import { undoUnit } from "./restore-undo.ts";

const RunningPhaseSchema = z.enum(RUNNING_RESTORE_PHASES);

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
      return filesUnit(ports, run, source);
    case "search":
      return searchUnit(ports, run);
    case "highlights":
      return highlightsUnit(ports, run);
    case "finish":
      return finishUnit(ports, run, source);
    case "undoing":
      return undoUnit(ports, run);
    default:
      return phase satisfies never;
  }
}
