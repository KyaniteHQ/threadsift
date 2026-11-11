import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { LOG_ACTIONS } from "./kinds.ts";
import { items, topics } from "./schema.ts";

export const logEntries = sqliteTable(
  "log_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    at: integer("at").notNull(),
    action: text("action", { enum: LOG_ACTIONS }).notNull(),
    title: text("title"),
    topic: text("topic"),
    tags: text("tags", { mode: "json" }).$type<readonly string[]>(),
    added: integer("added"),
    removed: integer("removed"),
    picks: integer("picks"),
    itemId: integer("item_id").references(() => items.id, { onDelete: "cascade" }),
    topicId: integer("topic_id").references(() => topics.id),
  },
  (table) => [
    index("log_entries_item").on(table.itemId),
    index("log_entries_topic").on(table.topicId),
  ],
);

export const logStart = sqliteTable(
  "log_start",
  {
    id: integer("id").primaryKey(),
    startedAt: integer("started_at").notNull(),
  },
  (table) => [check("log_start_is_one_row", sql`${table.id} = 1`)],
);
