import { eq, sql } from "drizzle-orm";

import { entering } from "../../../core/contract/restore-contract.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { guardedWrite } from "../../../core/kernel/guards.ts";
import type { JobPorts } from "../../../core/kernel/job-outcome.ts";
import { enqueueRows } from "../../../core/kernel/job-rows.ts";
import { NEWEST_RESTORE, RESUMABLE_RESTORE, resumable } from "../../../core/kernel/restore-hold.ts";
import { restoreRuns } from "../../../core/kernel/schema.ts";
import { fenceVault, vaultIdleAt } from "../../vault/core/vault-state.ts";
import {
  EMPTY_LIBRARY,
  holdsEveryPart,
  isNewestRestore,
  libraryIsEmpty,
  restoreById,
} from "./restore-state.ts";
import { openingRestoreJob } from "./restore-unit.ts";

type StartedRestore =
  | { readonly kind: "started" }
  | { readonly kind: "missing" }
  | { readonly kind: "not-uploading" }
  | { readonly kind: "library-not-empty" }
  | { readonly kind: "vault-busy" }
  | { readonly kind: "incomplete-upload" };

type ResumedRestore =
  | { readonly kind: "resumed" }
  | { readonly kind: "missing" }
  | { readonly kind: "superseded" }
  | { readonly kind: "not-resumable" }
  | { readonly kind: "incomplete-upload" };

function opened(db: Database, id: number) {
  const now = Date.now();
  const restore = eq(restoreRuns.id, id);
  const idle = vaultIdleAt(now);
  const ready = sql`${restore} and ${restoreRuns.state} = 'uploading' and ${EMPTY_LIBRARY} and ${idle}`;

  return db.batch([
    db
      .select({ state: restoreRuns.state, empty: sql<number>`${EMPTY_LIBRARY}`, idle })
      .from(restoreRuns)
      .where(restore),
    openingRestoreJob(db, ready),
    db
      .update(restoreRuns)
      .set({
        state: "running",
        ...entering("check"),
        updatedAt: now,
      })
      .where(ready),
    fenceVault(db),
  ]);
}

export async function startRestore(ports: JobPorts, id: number): Promise<StartedRestore> {
  const { db } = ports;
  const run = await restoreById(db, id);

  if (run === null) return { kind: "missing" };

  if (run.state !== "uploading") return { kind: "not-uploading" };

  if (!(await libraryIsEmpty(db))) return { kind: "library-not-empty" };

  if (!(await holdsEveryPart(ports.files, run))) return { kind: "incomplete-upload" };

  const [[current], jobs] = await opened(db, id);

  if (current === undefined) return { kind: "missing" };

  if (current.state !== "uploading") return { kind: "not-uploading" };

  if (current.empty === 0) return { kind: "library-not-empty" };

  if (current.idle === 0) return { kind: "vault-busy" };

  await enqueueRows(ports, jobs);

  return { kind: "started" };
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
