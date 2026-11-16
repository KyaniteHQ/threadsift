import type { JobOutcome, JobPorts } from "./job-outcome.ts";
import { checkUnit } from "./restore-check-unit.ts";
import { tablesUnit } from "./restore-copy.ts";
import { filesUnit } from "./restore-files.ts";
import { finishUnit } from "./restore-finish.ts";
import { highlightsUnit } from "./restore-highlights.ts";
import { searchUnit } from "./restore-search.ts";
import { undoUnit } from "./restore-undo.ts";
import type { RestoreRow } from "./schema.ts";
import type { ZipSource } from "./zip-read.ts";

export function phaseUnit(
  ports: JobPorts,
  run: Readonly<RestoreRow>,
  source: Readonly<ZipSource>,
): Promise<JobOutcome> {
  switch (run.phase) {
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
    case "upload":
      throw new Error(`Restore ${String(run.id)} runs in its upload phase`);
    default:
      return run.phase satisfies never;
  }
}
