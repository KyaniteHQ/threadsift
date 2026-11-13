import { eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

import type { Database } from "./ports.ts";

export const dataSteps = sqliteTable("data_steps", {
  name: text("name").primaryKey(),
  version: integer("version").notNull(),
  cursor: text("cursor"),
});

export const dataStepLease = sqliteTable(
  "data_step_lease",
  {
    id: integer("id").primaryKey(),
    holder: text("holder").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [check("data_step_lease_is_one_row", sql`${table.id} = 1`)],
);

export const dataStepRenames = sqliteTable(
  "data_step_renames",
  {
    step: text("step").notNull(),
    subject: integer("subject").notNull(),
    oldKey: text("old_key").notNull(),
    newKey: text("new_key").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.step, table.subject] }),
    index("data_step_renames_new_key").on(table.step, table.newKey),
  ],
);

const INSERT_ROWS = 24;

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
