import { and, eq, sql } from "drizzle-orm";

import { guardedResults } from "./guards.ts";
import { closeRunJobs } from "./job-close.ts";
import type { JobPorts } from "./job-outcome.ts";
import { OpenedJobsSchema, enqueueRows } from "./job-rows.ts";
import { entering } from "./restore-contract.ts";
import { NEWEST_RESTORE, UNDOABLE_RESTORE, UNDOING_RESTORE, cancelling } from "./restore-hold.ts";
import { removeParts } from "./restore-parts.ts";
import { isNewestRestore, restoreById } from "./restore-state.ts";
import { openingRestoreJob } from "./restore-unit.ts";
import { type RestoreRow, restoreRuns } from "./schema.ts";

export type CancelledRestore =
  | { readonly kind: "cancelled" }
  | { readonly kind: "undoing" }
  | { readonly kind: "missing" }
  | { readonly kind: "superseded" }
  | { readonly kind: "finished" };

async function cancelledUpload({ db, files }: Pick<JobPorts, "db" | "files">, id: number) {
  const now = Date.now();

  const ended = await db
    .update(restoreRuns)
    .set({ state: "cancelled", finishedAt: now, updatedAt: now })
    .where(and(eq(restoreRuns.id, id), eq(restoreRuns.state, "uploading")))
    .returning({ id: restoreRuns.id });

  if (ended.length > 0) await removeParts(files, id);

  return ended.length > 0;
}

async function undoing(ports: JobPorts, id: number): Promise<boolean> {
  const { db } = ports;

  const waiting = sql`${restoreRuns.id} = ${id} and ${NEWEST_RESTORE} and ${UNDOABLE_RESTORE}`;

  const written = await guardedResults(
    db,
    sql`exists (select 1 from ${restoreRuns} where ${waiting})`,
    [
      db
        .update(restoreRuns)
        .set({
          state: "running",
          ...entering("undoing"),
          failure: null,
          updatedAt: Date.now(),
        })
        .where(waiting),
      closeRunJobs(db, "restore", id),
      openingRestoreJob(db, sql`${restoreRuns.id} = ${id} and ${UNDOING_RESTORE}`),
    ],
  );

  if (written === null) return false;

  await enqueueRows(ports, OpenedJobsSchema.parse(written[2]));

  return true;
}

async function endedByUndo(ports: JobPorts, run: Readonly<RestoreRow>): Promise<CancelledRestore> {
  if (!(await isNewestRestore(ports.db, run.id))) return { kind: "superseded" };

  if (await undoing(ports, run.id)) return { kind: "undoing" };

  return cancelling(run) ? { kind: "undoing" } : cancelRestore(ports, run.id);
}

export async function cancelRestore(ports: JobPorts, id: number): Promise<CancelledRestore> {
  const run = await restoreById(ports.db, id);

  if (run === null) return { kind: "missing" };

  switch (run.state) {
    case "done":
      return { kind: "finished" };
    case "cancelled":
      await removeParts(ports.files, id);

      return { kind: "cancelled" };
    case "uploading":
      return (await cancelledUpload(ports, id)) ? { kind: "cancelled" } : cancelRestore(ports, id);
    case "running":
    case "failed":
      return endedByUndo(ports, run);
    default:
      return run.state satisfies never;
  }
}
