import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { THREAD_SOURCES } from "../contract/item-contract.ts";
import { COMMENT_KINDS } from "../contract/reddit-contract.ts";
import { items } from "./item-tables.ts";
import { listed } from "./schema-checks.ts";

export const threads = sqliteTable(
  "threads",
  {
    itemId: integer("item_id").notNull(),
    source: text("source", { enum: THREAD_SOURCES }).notNull(),
    generation: integer("generation").notNull(),
    reported: integer("reported"),
    archivedAt: integer("archived_at"),
    linkedUrl: text("linked_url"),
    postLink: text("post_link"),
    followUps: integer("follow_ups").notNull().default(0),
    xApiRead: integer("x_api_read", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.generation] }),
    foreignKey({
      columns: [table.itemId, table.source],
      foreignColumns: [items.id, items.source],
    }).onDelete("cascade"),
    check("threads_source_check", sql`${table.source} in (${listed(THREAD_SOURCES)})`),
  ],
);

export const threadComments = sqliteTable(
  "thread_comments",
  {
    itemId: integer("item_id").notNull(),
    source: text("source", { enum: THREAD_SOURCES }).notNull(),
    generation: integer("generation").notNull(),
    position: integer("position").notNull(),
    id: text("id").notNull(),
    parentId: text("parent_id"),
    depth: integer("depth").notNull(),
    kind: text("kind", { enum: COMMENT_KINDS }).notNull(),
    author: text("author"),
    body: text("body"),
    score: integer("score"),
    postedAt: integer("posted_at"),
    eligible: integer("eligible", { mode: "boolean" }).notNull(),
    kept: integer("kept", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.generation, table.position] }),
    uniqueIndex("thread_comments_id").on(table.itemId, table.generation, table.id),
    foreignKey({
      columns: [table.itemId, table.source],
      foreignColumns: [items.id, items.source],
    }).onDelete("cascade"),
    check("thread_comments_source_check", sql`${table.source} in (${listed(THREAD_SOURCES)})`),
  ],
);
