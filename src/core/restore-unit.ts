import { type SQL, type SQLWrapper, and, eq, exists, ne, sql } from "drizzle-orm";

import { restorePartKey } from "./file-keys.ts";
import { CLOSED_JOB } from "./job-close.ts";
import type { JobOutcome, JobWrites, SettledOutcome } from "./job-outcome.ts";
import { openingUnowned, unownedAddress } from "./job-rows.ts";
import type { Database } from "./ports.ts";
import type { RestoreFailure } from "./restore-contract.ts";
import { restoreById } from "./restore-state.ts";
import { type RestoreRow, jobs, restoreRuns } from "./schema.ts";

export function partKeysOf(run: Readonly<Pick<RestoreRow, "id" | "parts">>): readonly string[] {
  return Array.from({ length: run.parts }, (_, at) => restorePartKey(run.id, at + 1));
}

export function openingRestoreJob(db: Database, scope: Readonly<SQLWrapper>) {
  return openingUnowned(db, "restore", restoreRuns, scope);
}

export function closingRestoreJobs(db: Database, id: number) {
  return db
    .update(jobs)
    .set(CLOSED_JOB)
    .where(
      and(
        eq(jobs.kind, "restore"),
        eq(jobs.address, unownedAddress("restore", id)),
        ne(jobs.state, "done"),
      ),
    );
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

type Columns = typeof restoreRuns.$inferInsert;

export type RestoreSet = Readonly<{ [Column in keyof Columns]?: Columns[Column] | SQL }>;

export function steppedUnit(
  db: Database,
  run: Readonly<RestoreRow>,
  set: RestoreSet,
  before: JobWrites = [],
): SettledOutcome {
  return {
    writes: [
      ...before,
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
    files: { written: [], superseded: partKeysOf(run) },
  };
}

export function snapshotted(
  ports: Readonly<{ db: Database }>,
  run: Readonly<RestoreRow>,
  outcome: SettledOutcome,
  holds: readonly Readonly<SQLWrapper>[],
  redo: (current: Readonly<RestoreRow>) => Promise<SettledOutcome>,
): SettledOutcome {
  const { db } = ports;

  return {
    ...outcome,
    precondition: {
      holds: sql.join([precondition(db, run).holds, ...holds], sql` and `),
      rebuild: async () => {
        const current = await restoreById(db, run.id);

        return current?.state === "running" &&
          current.phase === run.phase &&
          current.cursor === run.cursor
          ? redo(current)
          : { writes: [] };
      },
    },
  };
}
