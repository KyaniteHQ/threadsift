import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { KINDS, SOURCES } from "./kinds.ts";

export const items = sqliteTable(
  "items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source", { enum: SOURCES }).notNull(),
    kind: text("kind", { enum: KINDS }).notNull(),
    normalizedUrl: text("normalized_url").notNull().unique(),
    originalUrl: text("original_url").notNull(),
    savedAt: integer("saved_at").notNull(),
    title: text("title"),
    author: text("author"),
    community: text("community"),
    fetchedAt: integer("fetched_at"),
  },
  (table) => [index("items_saved_at_id").on(table.savedAt, table.id)],
);

export type ItemRow = typeof items.$inferSelect;
