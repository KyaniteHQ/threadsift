import type { JobOutcome, JobPorts } from "./job-outcome.ts";
import { jobKeyWrites, sequenceWrites, singletonResets } from "./restore-sequences.ts";
import { endedUnit } from "./restore-unit.ts";
import { recordFiles } from "./restore-window.ts";
import type { RestoreRow } from "./schema.ts";
import type { ZipSource } from "./zip-read.ts";

export async function finishUnit(
  ports: JobPorts,
  run: Readonly<RestoreRow>,
  source: Readonly<ZipSource>,
): Promise<JobOutcome> {
  const { db } = ports;
  const { manifest } = await recordFiles(source);

  return endedUnit(db, run, { state: "done", finishedAt: Date.now(), updatedAt: Date.now() }, [
    ...sequenceWrites(db, manifest),
    ...jobKeyWrites(db),
    ...singletonResets(db, manifest),
  ]);
}
