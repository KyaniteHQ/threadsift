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

import { RELATED_MAX } from "../contract/related-contract.ts";
import { items } from "./item-tables.ts";

const LAST_POSITION = sql.raw(String(RELATED_MAX - 1));

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
    check("related_items_position_range", sql`${table.position} between 0 and ${LAST_POSITION}`),
    check("related_items_reason", sql`length(${table.reason}) > 0`),
  ],
);
