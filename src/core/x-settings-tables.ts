import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { X_READER_CHOICES } from "./kinds.ts";

export const xSettings = sqliteTable(
  "x_settings",
  {
    id: integer("id").primaryKey(),
    reader: text("reader", { enum: X_READER_CHOICES }).notNull(),
  },
  (table) => [
    check("x_settings_is_one_row", sql`${table.id} = 1`),
    check(
      "x_settings_reader",
      sql`${table.reader} in (${sql.raw(X_READER_CHOICES.map((choice) => `'${choice}'`).join(", "))})`,
    ),
  ],
);
