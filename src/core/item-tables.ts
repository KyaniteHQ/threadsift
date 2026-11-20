import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { tags, topics } from "./catalog-tables.ts";
import { FETCH_RESULTS } from "./fetch-results.ts";
import { FAILURE_REASONS, KINDS, READ_STATES, SOURCES, SOURCE_OF_KIND } from "./item-contract.ts";
import { caseOf, listed } from "./schema-checks.ts";
import { X_READ_NOTES } from "./x-read-note.ts";

export const items = sqliteTable(
  "items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source", { enum: SOURCES }).notNull(),
    kind: text("kind", { enum: KINDS }).notNull(),
    normalizedUrl: text("normalized_url").notNull().unique(),
    originalUrl: text("original_url").notNull(),
    savedAt: integer("saved_at").notNull(),
    title: text("title"),
    author: text("author"),
    community: text("community"),
    postText: text("post_text"),
    postTextKey: text("post_text_key"),
    postedAt: integer("posted_at"),
    fetchedAt: integer("fetched_at"),
    pendingDigest: text("pending_digest"),
    topicId: integer("topic_id").references(() => topics.id),
    generation: integer("generation").notNull().default(0),
    digestFailed: integer("digest_failed", { mode: "boolean" }).notNull().default(false),
    readState: text("read_state", { enum: READ_STATES }).notNull().default("unread"),
    reason: text("reason", { enum: FAILURE_REASONS }),
    fetch: text("fetch_result", { enum: FETCH_RESULTS }),
    xNote: text("x_note", { enum: X_READ_NOTES }),
    addedByToken: integer("added_by_token"),
  },
  (table) => [
    check("items_post_text_check", sql`${table.postText} is null or ${table.postTextKey} is null`),
    check("items_reason_check", sql`${table.reason} in (${listed(FAILURE_REASONS)})`),
    check(
      "items_source_kind_check",
      sql`${table.source} is (${caseOf(table.kind, SOURCE_OF_KIND)})`,
    ),
    index("items_saved_at_id").on(table.savedAt, table.id),
    index("items_topic").on(table.topicId),
    index("items_post_text_key").on(table.postTextKey),
  ],
);

export const githubRepos = sqliteTable("github_repos", {
  itemId: integer("item_id")
    .primaryKey()
    .references(() => items.id, { onDelete: "cascade" }),
  description: text("description"),
  stars: integer("stars").notNull(),
  language: text("language"),
  license: text("license"),
  topics: text("topics", { mode: "json" }).$type<readonly string[]>().notNull(),
  pushedAt: integer("pushed_at"),
});

export type ItemRow = typeof items.$inferSelect;

export const itemTags = sqliteTable(
  "item_tags",
  {
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id),
  },
  (table) => [
    uniqueIndex("item_tags_item_tag").on(table.itemId, table.tagId),
    index("item_tags_tag").on(table.tagId),
  ],
);
