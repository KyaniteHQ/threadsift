import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const topics = sqliteTable("topics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
});

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
});

export const catalogVersion = sqliteTable(
  "catalog_version",
  {
    id: integer("id").primaryKey(),
    version: integer("version").notNull().default(0),
  },
  (table) => [check("catalog_is_one_row", sql`${table.id} = 1`)],
);
