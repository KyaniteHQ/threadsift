import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { items } from "./schema.ts";

export const notes = sqliteTable("notes", {
  itemId: integer("item_id")
    .primaryKey()
    .references(() => items.id, { onDelete: "cascade" }),
  body: text("body"),
  revision: integer("revision").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export type NoteRow = typeof notes.$inferSelect;
