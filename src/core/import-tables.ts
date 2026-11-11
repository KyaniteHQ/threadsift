import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const imports = sqliteTable("imports", {
  name: text("name").primaryKey(),
  cursor: text("cursor").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export type ImportRow = typeof imports.$inferSelect;
