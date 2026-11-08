import { eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { dataStepRenames } from "./data-step-tables.ts";
import type { Database } from "./ports.ts";

const INSERT_ROWS = 24;

export function report(
  event: string,
  fields: Readonly<Record<string, number | string | readonly number[]>>,
) {
  console.warn(JSON.stringify({ event, ...fields }));
}

export function dropStaged(db: Database, step: string) {
  return db.delete(dataStepRenames).where(eq(dataStepRenames.step, step));
}

export function stageRenames(
  db: Database,
  rows: readonly (typeof dataStepRenames.$inferInsert)[],
): readonly BatchItem<"sqlite">[] {
  const writes: BatchItem<"sqlite">[] = [];

  for (let start = 0; start < rows.length; start += INSERT_ROWS) {
    writes.push(
      db
        .insert(dataStepRenames)
        .values(rows.slice(start, start + INSERT_ROWS))
        .onConflictDoUpdate({
          target: [dataStepRenames.step, dataStepRenames.subject],
          set: { oldKey: sql`excluded.old_key`, newKey: sql`excluded.new_key` },
        }),
    );
  }

  return writes;
}
