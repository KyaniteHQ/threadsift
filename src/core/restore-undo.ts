import { sql } from "drizzle-orm";

import type { Database } from "./database.ts";
import { FILE_LIST_LIMIT, ITEM_FILES_ROOT } from "./file-keys.ts";
import type { JobOutcome, JobPorts } from "./job-outcome.ts";
import { CountsSchema, RESTORE_UNIT_LINES, UndoCursorSchema } from "./restore-contract.ts";
import { RESTORE_ORDER, type TableSpec, tableSpec } from "./restore-registry.ts";
import { endedUnit, steppedUnit } from "./restore-unit.ts";
import type { RestoreRow } from "./schema.ts";

type Undone = Readonly<Pick<TableSpec, "table">>;

const DEPENDENTS: readonly Undone[] = RESTORE_ORDER.flatMap((name) =>
  (tableSpec(name)?.rebuiltInto ?? []).map((table) => ({ table })),
);

const UNDO_TABLES: readonly TableSpec[] = RESTORE_ORDER.toReversed().flatMap((name) => {
  const spec = tableSpec(name);

  return spec === undefined || spec.singleton === "keep" ? [] : [spec];
});

function undoTables(run: Readonly<RestoreRow>): readonly Undone[] {
  const restored = CountsSchema.parse(JSON.parse(run.restored));

  return [
    ...DEPENDENTS,
    ...UNDO_TABLES.filter(
      ({ name, singleton }) => singleton !== "reset" || (restored[name] ?? 0) > 0,
    ),
  ];
}

function restoredNothing(run: Readonly<RestoreRow>): boolean {
  return Object.keys(CountsSchema.parse(JSON.parse(run.restored))).length === 0;
}

function cancelledUnit(db: Database, run: Readonly<RestoreRow>): JobOutcome {
  const now = Date.now();

  return endedUnit(db, run, { state: "cancelled", finishedAt: now, updatedAt: now });
}

async function nextTable(db: Database, remaining: readonly Undone[]): Promise<Undone | null> {
  const [spec, ...rest] = remaining;

  if (spec === undefined) return null;

  const [found] = await db
    .select({ one: sql<number>`1` })
    .from(spec.table)
    .limit(1);

  return found === undefined ? nextTable(db, rest) : spec;
}

export async function undoUnit(
  { db, files }: Pick<JobPorts, "db" | "files">,
  run: Readonly<RestoreRow>,
): Promise<JobOutcome> {
  if (restoredNothing(run)) return cancelledUnit(db, run);

  const units = UndoCursorSchema.parse(JSON.parse(run.cursor)).units + 1;
  const stepped = steppedUnit(db, run, { cursor: JSON.stringify({ units }) });
  const table = await nextTable(db, undoTables(run));

  if (table !== null) {
    return {
      ...stepped,
      writes: [
        db
          .delete(table.table)
          .where(sql`rowid in (select rowid from ${table.table} limit ${RESTORE_UNIT_LINES})`),
        ...stepped.writes,
      ],
    };
  }

  const { keys: stored } = await files.list(ITEM_FILES_ROOT, null, FILE_LIST_LIMIT);

  if (stored.length > 0) {
    await files.delete(stored);

    return stepped;
  }

  return cancelledUnit(db, run);
}
