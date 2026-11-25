import { type SQLWrapper, sql } from "drizzle-orm";

import type { RestoreFailure } from "../contract/restore-contract.ts";
import type { Database } from "./database.ts";
import { answerUnlessRefused, holdsNoRow, insertGuard } from "./guards.ts";
import { HOLDING, NOTHING_WRITTEN, type Standing, standingSql } from "./restore-standing.ts";
import { type RestoreRow, restoreRuns } from "./schema.ts";
import { STALE } from "./vault-stale.ts";

type Condition = Readonly<Pick<RestoreRow, "state" | "phase" | "failure" | "restored">>;

const RESUMABLE: readonly Standing[] = [{ state: "failed", gaveUp: true, undoing: false }];

const UNDOABLE: readonly Standing[] = [
  { state: "failed", pastCheck: true },
  { state: "running", undoing: false, pastCheck: true },
];

const UNWRITTEN: readonly Standing[] = [
  { state: "failed", undoing: false, wrote: false },
  { state: "running", undoing: false, wrote: false },
];

const UNDOING: readonly Standing[] = [{ state: "running", undoing: true }];

const UNDO_FAILED: readonly Standing[] = [{ state: "failed", undoing: true }];

const NEEDING_PARTS: readonly Standing[] = [{ state: "running" }, ...RESUMABLE];

function inStanding(run: Readonly<Condition>, standings: readonly Standing[]): boolean {
  return standings.some(
    ({ state, gaveUp, undoing, pastCheck, wrote }) =>
      run.state === state &&
      (gaveUp !== true || run.failure === "gave-up") &&
      (undoing === undefined || (run.phase === "undoing") === undoing) &&
      (pastCheck === undefined || (run.phase !== "check") === pastCheck) &&
      (wrote === undefined || (run.restored !== NOTHING_WRITTEN) === wrote),
  );
}

export const NEWEST_RESTORE = sql`${restoreRuns.id} = (select max(${restoreRuns.id}) from ${restoreRuns})`;

export const RESUMABLE_RESTORE = standingSql(restoreRuns, RESUMABLE);

export const UNDOABLE_RESTORE = standingSql(restoreRuns, UNDOABLE);

export const UNWRITTEN_RESTORE = standingSql(restoreRuns, UNWRITTEN);

export const UNDOING_RESTORE = standingSql(restoreRuns, UNDOING);

export const HOLDS_LIBRARY = sql`${standingSql(restoreRuns, HOLDING)} and ${NEWEST_RESTORE}`;

export function wroteNothing(run: Readonly<Pick<RestoreRow, "restored">>): boolean {
  return run.restored === NOTHING_WRITTEN;
}

export function resumable(run: Readonly<Condition>): boolean {
  return inStanding(run, RESUMABLE);
}

export function cancelling(run: Readonly<Condition>): boolean {
  return inStanding(run, UNDOING);
}

export function undoFailed(run: Readonly<Condition>): boolean {
  return inStanding(run, UNDO_FAILED);
}

export function needsParts(run: Readonly<Condition>): boolean {
  return inStanding(run, NEEDING_PARTS);
}

export async function restoreHoldsLibrary(db: Database): Promise<boolean> {
  const [found] = await db
    .select({ one: sql<number>`1` })
    .from(restoreRuns)
    .where(HOLDS_LIBRARY)
    .limit(1);

  return found !== undefined;
}

export function holdsNoRestore(db: Database) {
  return holdsNoRow(db, restoreRuns, HOLDS_LIBRARY);
}

export function restoreGuard(db: Database) {
  return insertGuard(db, holdsNoRestore(db));
}

export type Closed = { readonly kind: "restoring" };

const CLOSED: Closed = { kind: "restoring" };

export function orRestoreHolds(db: Database, condition: Readonly<SQLWrapper>) {
  return sql`(${condition}) or not ${holdsNoRestore(db)}`;
}

export function whileOpen<Result>(
  db: Database,
  write: () => Promise<Result>,
): Promise<Result | Closed> {
  return answerUnlessRefused(db, holdsNoRestore(db), write, CLOSED);
}

export type Ending =
  | {
      readonly state: "done" | "cancelled";
      readonly finishedAt: number;
      readonly updatedAt: number;
    }
  | { readonly state: "failed"; readonly failure: RestoreFailure; readonly updatedAt: number };

export function mirrorAfter(db: Database, ending: Ending["state"]) {
  return ending === "failed" ? [] : STALE.library(db);
}
