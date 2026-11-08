import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { HIGHLIGHT_STATUSES } from "./kinds.ts";
import { items } from "./schema.ts";

export const highlights = sqliteTable(
  "highlights",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    commentId: text("comment_id"),
    exact: text("exact").notNull(),
    prefix: text("prefix").notNull(),
    suffix: text("suffix").notNull(),
    hint: integer("hint").notNull(),
    projection: integer("projection").notNull(),
    createdAt: integer("created_at").notNull(),
    status: text("status", { enum: HIGHLIGHT_STATUSES }).notNull(),
    start: integer("start"),
  },
  (table) => [
    index("highlights_item").on(table.itemId),
    check(
      "highlights_start_when_attached",
      sql`(${table.status} = 'attached') = (${table.start} is not null)`,
    ),
  ],
);

export type HighlightRow = typeof highlights.$inferSelect;
