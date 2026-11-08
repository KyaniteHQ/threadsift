import { type SQLWrapper, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { FETCH_RESULTS } from "./fetch-results.ts";
import {
  FAILURE_REASONS,
  ITEM_STATUSES,
  JOB_KINDS,
  JOB_STATES,
  KINDS,
  READ_STATES,
  SEARCH_PART_KINDS,
  SOURCES,
} from "./kinds.ts";
import type { Database } from "./ports.ts";

export {
  type AgentTokenRow,
  agentTokens,
  owner,
  sessions,
  spentResetCodes,
  throttles,
} from "./access-tables.ts";

export { redditComments, redditThreads } from "./reddit-tables.ts";

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
    status: text("status", { enum: ITEM_STATUSES }).notNull().default("ready"),
    reason: text("reason", { enum: FAILURE_REASONS }),
    fetch: text("fetch_result", { enum: FETCH_RESULTS }),
  },
  (table) => [
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

export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind", { enum: JOB_KINDS }).notNull(),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    state: text("state", { enum: JOB_STATES }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    staleRequeues: integer("stale_requeues").notNull().default(0),
    nextAttemptAt: integer("next_attempt_at").notNull(),
    claimExpires: integer("claim_expires"),
  },
  (table) => [
    uniqueIndex("jobs_one_open_per_item_kind")
      .on(table.itemId, table.kind)
      .where(sql`${table.state} <> 'done'`),
    index("jobs_state_next_attempt").on(table.state, table.nextAttemptAt),
  ],
);

export const ATTEMPT_KEY = sql<string>`'items/' || ${jobs.itemId} || '/post-' || ${jobs.id} || '-' || ${jobs.attempts} || '.md'`;

export const scheduledRuns = sqliteTable("scheduled_runs", {
  task: text("task").primaryKey(),
  lastRunAt: integer("last_run_at").notNull(),
});

export const fileCleaning = sqliteTable(
  "file_cleaning",
  {
    id: integer("id").primaryKey(),
    cursor: text("cursor"),
  },
  (table) => [check("file_cleaning_is_one_row", sql`${table.id} = 1`)],
);

export const guards = sqliteTable(
  "guards",
  {
    ok: integer("ok").notNull(),
  },
  (table) => [check("guards_hold", sql`${table.ok} = 1`)],
);

function guardRows(db: Database, condition: Readonly<SQLWrapper>) {
  return db
    .select({ ok: sql<number>`count(*)`.as("ok") })
    .from(sql`(select 1)`)
    .where(sql`${condition}`);
}

export function insertGuard(db: Database, condition: Readonly<SQLWrapper>) {
  return db.insert(guards).select(guardRows(db, condition));
}

export async function guardedBatch(
  db: Database,
  condition: Readonly<SQLWrapper>,
  writes: readonly BatchItem<"sqlite">[],
): Promise<boolean> {
  try {
    await db.batch([insertGuard(db, condition), ...writes, db.delete(guards)]);

    return true;
  } catch (error) {
    const [current] = await guardRows(db, condition);

    if (current?.ok === 1) throw error;

    return false;
  }
}

export type ItemRow = typeof items.$inferSelect;

export type JobRow = typeof jobs.$inferSelect;

export const settings = sqliteTable(
  "settings",
  {
    id: integer("id").primaryKey(),
    provider: text("provider", {
      enum: [
        "openai-compatible",
        "openrouter",
        "anthropic",
        "openai",
        "xai",
        "workers-ai",
        "claude-code",
      ],
    }).notNull(),
    baseUrl: text("base_url"),
    model: text("model").notNull(),
    sealedKey: text("sealed_key"),
  },
  (table) => [
    check("settings_is_one_row", sql`${table.id} = 1`),
    check(
      "settings_connection_columns",
      sql`(${table.provider} in ('workers-ai', 'claude-code') and ${table.baseUrl} is null and ${table.sealedKey} is null) or (${table.provider} not in ('workers-ai', 'claude-code') and ${table.baseUrl} is not null and ${table.sealedKey} is not null)`,
    ),
  ],
);

export const githubSettings = sqliteTable(
  "github_settings",
  {
    id: integer("id").primaryKey(),
    sealedToken: text("sealed_token").notNull(),
  },
  (table) => [check("github_settings_is_one_row", sql`${table.id} = 1`)],
);

export const aiTasks = sqliteTable(
  "ai_tasks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind").notNull(),
    inputs: text("inputs").notNull(),
    inputRevision: integer("input_revision").notNull(),
    executor: text("executor").notNull(),
    provider: text("provider"),
    model: text("model"),
    attempts: integer("attempts").notNull(),
    deadline: integer("deadline").notNull(),
    state: text("state", { enum: ["running", "done", "failed"] }).notNull(),
    result: text("result"),
    refusal: text("refusal"),
    status: integer("status"),
    itemId: integer("item_id").references(() => items.id, { onDelete: "cascade" }),
  },
  (table) => [index("ai_tasks_item").on(table.itemId)],
);

export const digests = sqliteTable("digests", {
  itemId: integer("item_id")
    .primaryKey()
    .references(() => items.id, { onDelete: "cascade" }),
  digest: text("digest").notNull(),
  title: text("title").notNull(),
  topic: text("topic").notNull(),
  taskId: integer("task_id")
    .notNull()
    .references(() => aiTasks.id),
  provider: text("provider"),
  model: text("model"),
  generation: integer("generation").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const topics = sqliteTable("topics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
});

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
});

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

export const catalogVersion = sqliteTable(
  "catalog_version",
  {
    id: integer("id").primaryKey(),
    version: integer("version").notNull().default(0),
  },
  (table) => [check("catalog_is_one_row", sql`${table.id} = 1`)],
);

export const catalogLinking = sqliteTable(
  "catalog_linking",
  {
    id: integer("id").primaryKey(),
    lastItemId: integer("last_item_id").notNull(),
  },
  (table) => [check("catalog_linking_is_one_row", sql`${table.id} = 1`)],
);

export const searchParts = sqliteTable(
  "search_parts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: SEARCH_PART_KINDS }).notNull(),
    body: text("body").notNull(),
  },
  (table) => [index("search_parts_item").on(table.itemId)],
);

export const searchFingerprints = sqliteTable("search_fingerprints", {
  itemId: integer("item_id")
    .primaryKey()
    .references(() => items.id, { onDelete: "cascade" }),
  fingerprint: text("fingerprint").notNull(),
});

export const searchReconciling = sqliteTable(
  "search_reconciling",
  {
    id: integer("id").primaryKey(),
    lastItemId: integer("last_item_id").notNull(),
  },
  (table) => [check("search_reconciling_is_one_row", sql`${table.id} = 1`)],
);
