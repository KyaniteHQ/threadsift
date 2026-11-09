import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
