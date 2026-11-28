import { sql } from "drizzle-orm";
import { check, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { X_API_DAY_LIMIT_MICROS, X_API_ITEM_LIMIT_MICROS } from "../contract/x-api-contract.ts";
import { items } from "./item-tables.ts";

export const xApiSettings = sqliteTable(
  "x_api_settings",
  {
    id: integer("id").primaryKey(),
    sealedToken: text("sealed_token"),
    itemLimitMicros: integer("item_limit_micros").notNull().default(X_API_ITEM_LIMIT_MICROS),
    dayLimitMicros: integer("day_limit_micros").notNull().default(X_API_DAY_LIMIT_MICROS),
  },
  (table) => [
    check("x_api_settings_is_one_row", sql`${table.id} = 1`),
    check(
      "x_api_settings_limits",
      sql`${table.itemLimitMicros} > 0 and ${table.dayLimitMicros} >= ${table.itemLimitMicros}`,
    ),
  ],
);

export const xApiSpend = sqliteTable(
  "x_api_spend",
  {
    day: text("day").primaryKey(),
    micros: integer("micros").notNull().default(0),
    posts: integer("posts").notNull().default(0),
    users: integer("users").notNull().default(0),
    xPosts: integer("x_posts"),
  },
  (table) => [
    check(
      "x_api_spend_counts",
      sql`${table.micros} >= 0 and ${table.posts} >= 0 and ${table.users} >= 0`,
    ),
  ],
);

export const xApiItemSpend = sqliteTable(
  "x_api_item_spend",
  {
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    micros: integer("micros").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.day] }),
    check("x_api_item_spend_micros", sql`${table.micros} >= 0`),
  ],
);
