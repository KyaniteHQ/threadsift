import { sql } from "drizzle-orm";

import { guardedWrite } from "./guards.ts";
import type { JobPorts } from "./job-outcome.ts";
import { enqueueRows } from "./job-rows.ts";
import type { Database } from "./ports.ts";
import { START_CHECK } from "./restore-contract.ts";
import { EMPTY_LIBRARY, holdsEveryPart, libraryIsEmpty, restoreById } from "./restore-state.ts";
import { openingRestoreJob } from "./restore-unit.ts";
import { restoreRuns } from "./schema.ts";

export type StartedRestore =
  | { readonly kind: "started" }
  | { readonly kind: "missing" }
  | { readonly kind: "not-uploading" }
  | { readonly kind: "library-not-empty" }
  | { readonly kind: "incomplete-upload" };

async function opened(db: Database, id: number) {
  const waiting = sql`${restoreRuns.id} = ${id} and ${restoreRuns.state} = 'uploading'`;

  const written = await guardedWrite(
    db,
    sql`${EMPTY_LIBRARY} and exists (select 1 from ${restoreRuns} where ${waiting})`,
    openingRestoreJob(db, waiting),
    [
      db
        .update(restoreRuns)
        .set({
          state: "running",
          phase: "check",
          cursor: JSON.stringify(START_CHECK),
          updatedAt: Date.now(),
        })
        .where(sql`${waiting}`),
    ],
  );

  return written ?? [];
}

export async function startRestore(ports: JobPorts, id: number): Promise<StartedRestore> {
  const { db } = ports;
  const run = await restoreById(db, id);

  if (run === null) return { kind: "missing" };

  if (run.state !== "uploading") return { kind: "not-uploading" };

  if (!(await libraryIsEmpty(db))) return { kind: "library-not-empty" };

  if (!(await holdsEveryPart(ports.files, run))) return { kind: "incomplete-upload" };

  const jobs = await opened(db, id);

  if (jobs.length === 0) {
    return (await libraryIsEmpty(db)) ? { kind: "not-uploading" } : { kind: "library-not-empty" };
  }

  await enqueueRows(ports, jobs);

  return { kind: "started" };
}
