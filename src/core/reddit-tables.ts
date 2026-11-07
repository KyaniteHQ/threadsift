import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { items } from "./schema.ts";

export const COMMENT_KINDS = ["comment", "more"] as const;

export const redditThreads = sqliteTable(
  "reddit_threads",
  {
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    generation: integer("generation").notNull(),
    reported: integer("reported"),
  },
  (table) => [primaryKey({ columns: [table.itemId, table.generation] })],
);

export const redditComments = sqliteTable(
  "reddit_comments",
  {
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
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
    uniqueIndex("reddit_comments_id").on(table.itemId, table.generation, table.id),
  ],
);
