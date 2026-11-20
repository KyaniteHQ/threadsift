import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { LOG_ACTIONS, LOG } from "../contract/log-actions.ts";
import { topics } from "./catalog-tables.ts";
import { items } from "./item-tables.ts";
import { listed } from "./schema-checks.ts";

const PATH_ACTIONS = LOG_ACTIONS.filter((action) =>
  LOG[action].schema
    .unwrap()
    .keyof()
    .options.some((key) => key === "path"),
);

export const logEntries = sqliteTable(
  "log_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    at: integer("at").notNull(),
    action: text("action", { enum: LOG_ACTIONS }).notNull(),
    title: text("title"),
    path: text("path"),
    topic: text("topic"),
    tags: text("tags", { mode: "json" }).$type<readonly string[]>(),
    added: integer("added"),
    removed: integer("removed"),
    picks: integer("picks"),
    mergedFrom: text("merged_from"),
    mergedInto: text("merged_into"),
    moved: integer("moved"),
    itemId: integer("item_id").references(() => items.id, { onDelete: "cascade" }),
    topicId: integer("topic_id").references(() => topics.id),
  },
  (table) => [
    check("log_entries_action_check", sql`${table.action} in (${listed(LOG_ACTIONS)})`),
    check(
      "log_entries_vault_path",
      sql`(${table.path} is not null) = (${table.action} in (${listed(PATH_ACTIONS)}))`,
    ),
    index("log_entries_at").on(table.at),
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
