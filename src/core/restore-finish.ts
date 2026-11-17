import { eq } from "drizzle-orm";

import type { JobOutcome, JobPorts } from "./job-outcome.ts";
import { jobKeyWrites, sequenceWrites, singletonResets } from "./restore-sequences.ts";
import { partKeysOf, precondition } from "./restore-unit.ts";
import { recordFiles } from "./restore-window.ts";
import { type RestoreRow, restoreRuns } from "./schema.ts";
import type { ZipSource } from "./zip-read.ts";

export async function finishUnit(
  ports: JobPorts,
  run: Readonly<RestoreRow>,
  source: Readonly<ZipSource>,
): Promise<JobOutcome> {
  const { db } = ports;
  const { manifest } = await recordFiles(source);

  return {
    writes: [
      ...sequenceWrites(db, manifest),
      ...jobKeyWrites(db),
      ...singletonResets(db, manifest),
      db
        .update(restoreRuns)
        .set({ state: "done", finishedAt: Date.now(), updatedAt: Date.now() })
        .where(eq(restoreRuns.id, run.id)),
    ],
    precondition: precondition(db, run),
    files: { written: [], superseded: partKeysOf(run) },
  };
}
