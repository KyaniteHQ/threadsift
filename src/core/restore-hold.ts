import { type SQL, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";

import type { Database } from "./database.ts";
import { refusedBy } from "./guards.ts";
import type { RestoreFailure } from "./restore-contract.ts";
import { listed } from "./schema-checks.ts";
import { type RestoreRow, restoreRuns } from "./schema.ts";
import { STALE } from "./vault-stale.ts";

const REFUSED_BY_TRIGGER = /items_restoring: /u;

type Standing = Readonly<{
  state: RestoreRow["state"];
  gaveUp?: true;
  undoing?: boolean;
  pastCheck?: boolean;
}>;

type Condition = Readonly<Pick<RestoreRow, "state" | "phase" | "failure">>;

const HOLDING: readonly Standing[] = [{ state: "running" }, { state: "failed", gaveUp: true }];

const RESUMABLE: readonly Standing[] = [{ state: "failed", gaveUp: true, undoing: false }];

const UNDOABLE: readonly Standing[] = [
  { state: "failed", pastCheck: true },
  { state: "running", undoing: false, pastCheck: true },
];

const UNWRITTEN: readonly Standing[] = [
  { state: "failed", pastCheck: false },
  { state: "running", pastCheck: false },
];

const UNDOING: readonly Standing[] = [{ state: "running", undoing: true }];

const UNDO_FAILED: readonly Standing[] = [{ state: "failed", undoing: true }];

const NEEDING_PARTS: readonly Standing[] = [{ state: "running" }, ...RESUMABLE];

function conditionsOf({ state, gaveUp, undoing, pastCheck }: Standing): readonly SQL[] {
  return [
    sql`${restoreRuns.state} = ${listed([state])}`,
    ...(gaveUp === true ? [sql`${restoreRuns.failure} = 'gave-up'`] : []),
    ...(undoing === undefined
      ? []
      : [undoing ? sql`${restoreRuns.phase} = 'undoing'` : sql`${restoreRuns.phase} <> 'undoing'`]),
    ...(pastCheck === undefined
      ? []
      : [pastCheck ? sql`${restoreRuns.phase} <> 'check'` : sql`${restoreRuns.phase} = 'check'`]),
  ];
}

function allOf(conditions: readonly SQL[]): SQL {
  return sql.join([...conditions], sql` and `);
}

function groupOf(conditions: readonly SQL[]): SQL {
  return conditions.length > 1 ? sql`(${allOf(conditions)})` : allOf(conditions);
}

function standingSql(standings: readonly Standing[]): SQL {
  const [only, ...others] = standings;

  if (only !== undefined && others.length === 0) {
    return allOf(conditionsOf(only));
  }

  return sql`(${sql.join(
    standings.map((standing) => groupOf(conditionsOf(standing))),
    sql` or `,
  )})`;
}

function inStanding(run: Readonly<Condition>, standings: readonly Standing[]): boolean {
  return standings.some(
    ({ state, gaveUp, undoing, pastCheck }) =>
      run.state === state &&
      (gaveUp !== true || run.failure === "gave-up") &&
      (undoing === undefined || (run.phase === "undoing") === undoing) &&
      (pastCheck === undefined || (run.phase !== "check") === pastCheck),
  );
}

export const NEWEST_RESTORE = sql`${restoreRuns.id} = (select max(${restoreRuns.id}) from ${restoreRuns})`;

export const RESUMABLE_RESTORE = standingSql(RESUMABLE);

export const UNDOABLE_RESTORE = standingSql(UNDOABLE);

export const UNWRITTEN_RESTORE = standingSql(UNWRITTEN);

export const UNDOING_RESTORE = standingSql(UNDOING);

export const HOLDS_LIBRARY = sql`${standingSql(HOLDING)} and ${NEWEST_RESTORE}`;

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

export type Closed = { readonly kind: "restoring" };

export async function whileOpen<Result>(
  db: Database,
  write: () => Promise<Result>,
): Promise<Result | Closed> {
  if (await restoreHoldsLibrary(db)) return { kind: "restoring" };

  try {
    return await write();
  } catch (error) {
    if (refusedBy(error, REFUSED_BY_TRIGGER)) return { kind: "restoring" };

    throw error;
  }
}

export function writingRows(
  db: Database,
  id: number,
  rows: BatchItem<"sqlite">,
  after: Omit<SQLiteUpdateSetSource<typeof restoreRuns>, "writing">,
): readonly BatchItem<"sqlite">[] {
  return [
    db.update(restoreRuns).set({ writing: 1 }).where(eq(restoreRuns.id, id)),
    rows,
    db
      .update(restoreRuns)
      .set({ writing: 0, ...after })
      .where(eq(restoreRuns.id, id)),
  ];
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
