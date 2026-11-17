import { and, eq, sql } from "drizzle-orm";

import { guardedResults, guardedWrite } from "./guards.ts";
import type { JobPorts } from "./job-outcome.ts";
import { OpenedJobsSchema, enqueueRows } from "./job-rows.ts";
import { START_UNDO } from "./restore-contract.ts";
import { removeParts } from "./restore-parts.ts";
import {
  NEWEST_RESTORE,
  RESUMABLE_RESTORE,
  holdsEveryPart,
  isNewestRestore,
  restoreById,
  resumable,
} from "./restore-state.ts";
import { closingRestoreJobs, openingRestoreJob } from "./restore-unit.ts";
import { type RestoreRow, restoreRuns } from "./schema.ts";

export type CancelledRestore =
  | { readonly kind: "cancelled" }
  | { readonly kind: "undoing" }
  | { readonly kind: "missing" }
  | { readonly kind: "superseded" }
  | { readonly kind: "finished" };

export type ResumedRestore =
  | { readonly kind: "resumed" }
  | { readonly kind: "missing" }
  | { readonly kind: "superseded" }
  | { readonly kind: "not-resumable" }
  | { readonly kind: "incomplete-upload" };

const RUNNING_AGAIN = sql`${restoreRuns.state} = 'running'`;

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

  const waiting = sql`${restoreRuns.id} = ${id} and ${NEWEST_RESTORE} and (${restoreRuns.state} = 'failed' or (${RUNNING_AGAIN} and ${restoreRuns.phase} <> 'undoing'))`;

  const written = await guardedResults(
    db,
    sql`exists (select 1 from ${restoreRuns} where ${waiting})`,
    [
      db
        .update(restoreRuns)
        .set({
          state: "running",
          phase: "undoing",
          cursor: JSON.stringify(START_UNDO),
          failure: null,
          updatedAt: Date.now(),
        })
        .where(waiting),
      closingRestoreJobs(db, id),
      openingRestoreJob(
        db,
        sql`${restoreRuns.id} = ${id} and ${RUNNING_AGAIN} and ${restoreRuns.phase} = 'undoing'`,
      ),
    ],
  );

  if (written === null) return false;

  await enqueueRows(ports, OpenedJobsSchema.parse(written[2]));

  return true;
}

async function endedByUndo(ports: JobPorts, run: Readonly<RestoreRow>): Promise<CancelledRestore> {
  if (!(await isNewestRestore(ports.db, run.id))) return { kind: "superseded" };

  if (await undoing(ports, run.id)) return { kind: "undoing" };

  return run.state === "running" && run.phase === "undoing"
    ? { kind: "undoing" }
    : cancelRestore(ports, run.id);
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

export async function resumeRestore(ports: JobPorts, id: number): Promise<ResumedRestore> {
  const { db } = ports;
  const run = await restoreById(db, id);

  if (run === null) return { kind: "missing" };

  if (!(await isNewestRestore(db, id))) return { kind: "superseded" };

  if (!resumable(run)) return { kind: "not-resumable" };

  if (!(await holdsEveryPart(ports.files, run))) return { kind: "incomplete-upload" };

  const waiting = sql`${restoreRuns.id} = ${id} and ${NEWEST_RESTORE} and ${RESUMABLE_RESTORE}`;

  const written = await guardedWrite(
    db,
    sql`exists (select 1 from ${restoreRuns} where ${waiting})`,
    openingRestoreJob(db, waiting),
    [
      db
        .update(restoreRuns)
        .set({ state: "running", failure: null, updatedAt: Date.now() })
        .where(waiting),
    ],
  );

  if (written === null) return { kind: "not-resumable" };

  await enqueueRows(ports, written);

  return { kind: "resumed" };
}
