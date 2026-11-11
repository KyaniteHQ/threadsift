import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { items } from "./schema.ts";

export const relatedItems = sqliteTable(
  "related_items",
  {
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    relatedId: integer("related_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    reason: text("reason").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.relatedId] }),
    uniqueIndex("related_items_position").on(table.itemId, table.position),
    index("related_items_related").on(table.relatedId),
    check("related_items_distinct", sql`${table.itemId} <> ${table.relatedId}`),
    check("related_items_position_range", sql`${table.position} between 0 and 4`),
    check("related_items_reason", sql`length(${table.reason}) > 0`),
  ],
);
