import { type SQLWrapper, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { RestoreFailure } from "../contract/restore-contract.ts";
import type { Database } from "./database.ts";
import {
  answeringRefusal,
  guards,
  holdsNoRow,
  insertGuard,
  refusedWith,
  unlessRefused,
} from "./guards.ts";
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
  return insertGuard(db, holdsNoRestore(db), "restore");
}

export type Closed = { readonly kind: "restoring" };

const CLOSED: Closed = { kind: "restoring" };

export function heldBatch<Writes extends readonly BatchItem<"sqlite">[]>(
  db: Database,
  writes: Writes,
  condition?: Readonly<SQLWrapper>,
) {
  return unlessRefused(async () => {
    if (condition === undefined) {
      const [, ...results] = await db.batch([
        restoreGuard(db),
        ...writes,
        db.delete(guards),
      ] as const);

      return results;
    }

    const [, , ...results] = await db.batch([
      restoreGuard(db),
      insertGuard(db, condition),
      ...writes,
      db.delete(guards),
    ] as const);

    return results;
  });
}

export function whileOpen<Result>(write: () => Promise<Result>): Promise<Result | Closed> {
  return answeringRefusal("restore", write, CLOSED);
}

export async function unlessHeld<Answer>(db: Database, answer: Answer): Promise<Answer | Closed> {
  return (await restoreHoldsLibrary(db)) ? CLOSED : answer;
}

export function isClosed<Result>(
  outcome: Result | Closed,
): outcome is Extract<Result | Closed, Closed> {
  return outcome === CLOSED;
}

export function heldOff(cause: unknown): boolean {
  return refusedWith(cause, "restore");
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
