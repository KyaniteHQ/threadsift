import { type SQL, and, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { entering } from "../contract/restore-contract.ts";
import { guardedResults } from "../kernel/guards.ts";
import { closeRunJobs } from "../kernel/job-close.ts";
import type { JobPorts } from "../kernel/job-outcome.ts";
import { OpenedJobsSchema, enqueueRows } from "../kernel/job-rows.ts";
import {
  NEWEST_RESTORE,
  UNWRITTEN_RESTORE,
  UNDOABLE_RESTORE,
  UNDOING_RESTORE,
  cancelling,
} from "../kernel/restore-hold.ts";
import { type RestoreRow, restoreRuns } from "../kernel/schema.ts";
import { removeParts } from "./restore-parts.ts";
import { isNewestRestore, restoreById } from "./restore-state.ts";
import { openingRestoreJob } from "./restore-unit.ts";

type CancelledRestore =
  | { readonly kind: "cancelled" }
  | { readonly kind: "undoing" }
  | { readonly kind: "nothing-to-undo" }
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

function guardedCancel(
  db: JobPorts["db"],
  id: number,
  standing: SQL,
  writes: (waiting: SQL) => readonly BatchItem<"sqlite">[],
) {
  const waiting = sql`${restoreRuns.id} = ${id} and ${NEWEST_RESTORE} and ${standing}`;

  return guardedResults(
    db,
    sql`exists (select 1 from ${restoreRuns} where ${waiting})`,
    writes(waiting),
  );
}

async function cancelledUnwritten(
  { db, files }: Pick<JobPorts, "db" | "files">,
  id: number,
): Promise<boolean> {
  const now = Date.now();

  const written = await guardedCancel(db, id, UNWRITTEN_RESTORE, (waiting) => [
    db
      .update(restoreRuns)
      .set({ state: "cancelled", failure: null, finishedAt: now, updatedAt: now })
      .where(waiting),
    closeRunJobs(db, "restore", id),
  ]);

  if (written === null) return false;

  await removeParts(files, id);

  return true;
}

async function undoing(ports: JobPorts, id: number): Promise<boolean> {
  const { db } = ports;

  const written = await guardedCancel(db, id, UNDOABLE_RESTORE, (waiting) => [
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
  ]);

  if (written === null) return false;

  await enqueueRows(ports, OpenedJobsSchema.parse(written[2]));

  return true;
}

async function settledByCancel(
  ports: JobPorts,
  run: Readonly<RestoreRow>,
): Promise<CancelledRestore> {
  if (!(await isNewestRestore(ports.db, run.id))) return { kind: "superseded" };

  if (await cancelledUnwritten(ports, run.id)) return { kind: "nothing-to-undo" };

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
      return settledByCancel(ports, run);
    default:
      return run.state satisfies never;
  }
}
