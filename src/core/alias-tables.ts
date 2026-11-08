import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { items } from "./schema.ts";

export const itemAliases = sqliteTable(
  "item_aliases",
  {
    normalizedUrl: text("normalized_url").primaryKey().notNull(),
    address: text("address").notNull(),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
  },
  (table) => [index("item_aliases_item").on(table.itemId)],
);
