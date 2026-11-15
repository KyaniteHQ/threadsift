import { type SQLWrapper, and, eq, exists, sql } from "drizzle-orm";

import { restorePartKey } from "./file-keys.ts";
import type { JobOutcome } from "./job-outcome.ts";
import { openingUnowned } from "./job-rows.ts";
import type { Database } from "./ports.ts";
import type { RestoreFailure } from "./restore-contract.ts";
import { type RestoreRow, restoreRuns } from "./schema.ts";

export function openingRestoreJob(db: Database, scope: Readonly<SQLWrapper>) {
  return openingUnowned(db, "restore", restoreRuns, scope);
}

function stillAt(db: Database, run: Readonly<RestoreRow>) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(restoreRuns)
      .where(
        and(
          eq(restoreRuns.id, run.id),
          eq(restoreRuns.state, "running"),
          eq(restoreRuns.phase, run.phase),
          eq(restoreRuns.cursor, run.cursor),
        ),
      ),
  );
}

export function continuation(db: Database, run: Readonly<RestoreRow>) {
  return [openingRestoreJob(db, eq(restoreRuns.id, run.id))];
}

export function precondition(db: Database, run: Readonly<RestoreRow>) {
  return {
    holds: stillAt(db, run),
    rebuild: () => Promise.resolve({ writes: [] }),
  };
}

export function steppedUnit(
  db: Database,
  run: Readonly<RestoreRow>,
  set: Readonly<Partial<typeof restoreRuns.$inferInsert>>,
): JobOutcome {
  return {
    writes: [
      db
        .update(restoreRuns)
        .set({ ...set, updatedAt: Date.now() })
        .where(eq(restoreRuns.id, run.id)),
    ],
    precondition: precondition(db, run),
    continuation: continuation(db, run),
  };
}

export function failedUnit(
  db: Database,
  run: Readonly<RestoreRow>,
  failure: RestoreFailure,
): JobOutcome {
  return {
    writes: [
      db
        .update(restoreRuns)
        .set({ state: "failed", failure, updatedAt: Date.now() })
        .where(eq(restoreRuns.id, run.id)),
    ],
    precondition: precondition(db, run),
    files: {
      written: [],
      superseded: Array.from({ length: run.parts }, (_, at) => restorePartKey(run.id, at + 1)),
    },
  };
}
