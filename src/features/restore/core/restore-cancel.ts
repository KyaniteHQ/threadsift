import { type SQL, and, eq, sql } from "drizzle-orm";

import { entering } from "../../../core/contract/restore-contract.ts";
import { guardedBatch } from "../../../core/kernel/guards.ts";
import { closeRunJobs } from "../../../core/kernel/job-close.ts";
import type { JobPorts } from "../../../core/kernel/job-outcome.ts";
import { enqueueRows, guardedOpenings } from "../../../core/kernel/job-rows.ts";
import {
  NEWEST_RESTORE,
  UNWRITTEN_RESTORE,
  UNDOABLE_RESTORE,
  UNDOING_RESTORE,
  cancelling,
} from "../../../core/kernel/restore-hold.ts";
import { type RestoreRow, restoreRuns } from "../../../core/kernel/schema.ts";
import { removeParts } from "./restore-parts.ts";
import { isNewestRestore, restoreById } from "./restore-state.ts";
import { openingRestoreJob } from "./restore-unit.ts";

type CancelledRestore =
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

function cancelScope(id: number, standing: SQL) {
  const waiting = sql`${restoreRuns.id} = ${id} and ${NEWEST_RESTORE} and ${standing}`;

  return { waiting, held: sql`exists (select 1 from ${restoreRuns} where ${waiting})` };
}

async function cancelledUnwritten(
  { db, files }: Pick<JobPorts, "db" | "files">,
  id: number,
): Promise<boolean> {
  const now = Date.now();

  const { waiting, held } = cancelScope(id, UNWRITTEN_RESTORE);

  const written = await guardedBatch(db, held, [
    db
      .update(restoreRuns)
      .set({ state: "cancelled", failure: null, finishedAt: now, updatedAt: now })
      .where(waiting),
    closeRunJobs(db, "restore", id),
  ]);

  if (!written) return false;

  await removeParts(files, id);

  return true;
}

async function undoing(ports: JobPorts, id: number): Promise<boolean> {
  const { db } = ports;

  const { waiting, held } = cancelScope(id, UNDOABLE_RESTORE);

  const opened = await guardedOpenings(db, held, {
    before: [
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
    ],
    opening: [openingRestoreJob(db, sql`${restoreRuns.id} = ${id} and ${UNDOING_RESTORE}`)],
  });

  if (opened === null) return false;

  await enqueueRows(ports, opened);

  return true;
}

async function settledByCancel(
  ports: JobPorts,
  run: Readonly<RestoreRow>,
): Promise<CancelledRestore> {
  if (!(await isNewestRestore(ports.db, run.id))) return { kind: "superseded" };

  if (await cancelledUnwritten(ports, run.id)) return { kind: "cancelled" };

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
