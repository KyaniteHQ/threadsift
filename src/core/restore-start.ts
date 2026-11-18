import { eq, sql } from "drizzle-orm";

import type { JobPorts } from "./job-outcome.ts";
import { enqueueRows } from "./job-rows.ts";
import type { Database } from "./ports.ts";
import { START_CHECK } from "./restore-contract.ts";
import { EMPTY_LIBRARY, holdsEveryPart, libraryIsEmpty, restoreById } from "./restore-state.ts";
import { openingRestoreJob } from "./restore-unit.ts";
import { restoreRuns } from "./schema.ts";
import { fenceVault, vaultIdleAt } from "./vault-state.ts";

export type StartedRestore =
  | { readonly kind: "started" }
  | { readonly kind: "missing" }
  | { readonly kind: "not-uploading" }
  | { readonly kind: "library-not-empty" }
  | { readonly kind: "vault-busy" }
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
        phase: "check",
        cursor: JSON.stringify(START_CHECK),
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
