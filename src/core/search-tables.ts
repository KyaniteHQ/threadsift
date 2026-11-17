import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { highlights } from "./highlight-tables.ts";
import { SEARCH_PART_KINDS } from "./kinds.ts";
import { items } from "./schema.ts";

export const searchParts = sqliteTable(
  "search_parts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: SEARCH_PART_KINDS }).notNull(),
    body: text("body").notNull(),
    highlightId: integer("highlight_id").references(() => highlights.id),
  },
  (table) => [
    index("search_parts_item").on(table.itemId),
    uniqueIndex("search_parts_highlight").on(table.highlightId),
  ],
);
