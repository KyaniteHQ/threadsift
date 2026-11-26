import { sql } from "drizzle-orm";
import { check, integer, sqliteTable } from "drizzle-orm/sqlite-core";

export const redditSettings = sqliteTable(
  "reddit_settings",
  {
    id: integer("id").primaryKey(),
    archiveFill: integer("archive_fill", { mode: "boolean" }).notNull(),
  },
  (table) => [check("reddit_settings_is_one_row", sql`${table.id} = 1`)],
);
