import { type SQL, type SQLWrapper, eq, sql } from "drizzle-orm";

import type { JobOutcome, JobPorts } from "./job-outcome.ts";
import { type Cursor, CursorSchema, START_CURSOR } from "./restore-contract.ts";
import { insertRows, knownTable } from "./restore-rows.ts";
import { continuation, precondition, steppedUnit } from "./restore-unit.ts";
import { opened, windowLines } from "./restore-window.ts";
import { type RestoreRow, restoreRuns } from "./schema.ts";
import type { ZipSource } from "./zip-read.ts";

function tallied(column: Readonly<SQLWrapper>, table: string, delta: SQL): SQL {
  const path = sql.raw(`'$.${table}'`);

  return sql`json_set(${column}, ${path}, coalesce(json_extract(${column}, ${path}), 0) + ${delta})`;
}

export async function tablesUnit(
  ports: JobPorts,
  run: Readonly<RestoreRow>,
  source: Readonly<ZipSource>,
): Promise<JobOutcome> {
  const { db } = ports;
  const cursor = CursorSchema.parse(JSON.parse(run.cursor));
  const at = await opened(source, cursor);

  if (at === null) {
    return steppedUnit(db, run, { phase: "finish", cursor: JSON.stringify(START_CURSOR) });
  }

  const spec = knownTable(at.entry.table);

  const { lines, consumed } = await windowLines(source, at);

  const next: Cursor = {
    file: at.file,
    entry: at.entry,
    offset: at.offset + consumed,
    line: at.line + lines.length,
  };

  return {
    writes: [
      db.update(restoreRuns).set({ writing: 1 }).where(eq(restoreRuns.id, run.id)),
      insertRows(db, spec, lines),
      db
        .update(restoreRuns)
        .set({
          writing: 0,
          cursor: JSON.stringify(next),
          restored: tallied(restoreRuns.restored, spec.name, sql`changes()`),
          dropped: tallied(restoreRuns.dropped, spec.name, sql`${lines.length} - changes()`),
          updatedAt: Date.now(),
        })
        .where(eq(restoreRuns.id, run.id)),
    ],
    precondition: precondition(db, run),
    continuation: continuation(db, run),
  };
}
