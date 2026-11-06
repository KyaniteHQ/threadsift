import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { FETCH_RESULTS } from "./fetch-results.ts";
import {
  FAILURE_REASONS,
  ITEM_STATUSES,
  JOB_KINDS,
  JOB_STATES,
  KINDS,
  SOURCES,
  THROTTLE_KINDS,
} from "./kinds.ts";

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
    postedAt: integer("posted_at"),
    fetchedAt: integer("fetched_at"),
    pendingDigest: text("pending_digest"),
    topicId: integer("topic_id").references(() => topics.id),
    generation: integer("generation").notNull().default(0),
    digestFailed: integer("digest_failed", { mode: "boolean" }).notNull().default(false),
    status: text("status", { enum: ITEM_STATUSES }).notNull().default("ready"),
    reason: text("reason", { enum: FAILURE_REASONS }),
    fetch: text("fetch_result", { enum: FETCH_RESULTS }),
  },
  (table) => [index("items_saved_at_id").on(table.savedAt, table.id)],
);

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
    catalogRetries: integer("catalog_retries").notNull().default(0),
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

export const scheduledRuns = sqliteTable("scheduled_runs", {
  task: text("task").primaryKey(),
  lastRunAt: integer("last_run_at").notNull(),
});

export const guards = sqliteTable(
  "guards",
  {
    ok: integer("ok").notNull(),
  },
  (table) => [check("guards_hold", sql`${table.ok} = 1`)],
);

export const owner = sqliteTable(
  "owner",
  {
    id: integer("id").primaryKey(),
    passwordHash: text("password_hash").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [check("owner_is_one_row", sql`${table.id} = 1`)],
);

export const sessions = sqliteTable("sessions", {
  digest: text("digest").primaryKey(),
  expiresAt: integer("expires_at").notNull(),
});

export const agentTokens = sqliteTable("agent_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  digest: text("digest").notNull().unique(),
  createdAt: integer("created_at").notNull(),
  lastUsedAt: integer("last_used_at"),
});

export const throttles = sqliteTable("throttles", {
  kind: text("kind", { enum: THROTTLE_KINDS }).primaryKey(),
  failures: integer("failures").notNull(),
  lockedUntil: integer("locked_until").notNull(),
});

export type ItemRow = typeof items.$inferSelect;

export type JobRow = typeof jobs.$inferSelect;

export type AgentTokenRow = typeof agentTokens.$inferSelect;

export const settings = sqliteTable(
  "settings",
  {
    id: integer("id").primaryKey(),
    provider: text("provider", { enum: ["openai-compatible", "openrouter"] }).notNull(),
    baseUrl: text("base_url").notNull(),
    model: text("model").notNull(),
    sealedKey: text("sealed_key").notNull(),
  },
  (table) => [check("settings_is_one_row", sql`${table.id} = 1`)],
);

export const aiTasks = sqliteTable("ai_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(),
  inputs: text("inputs").notNull(),
  inputRevision: integer("input_revision").notNull(),
  executor: text("executor").notNull(),
  attempts: integer("attempts").notNull(),
  deadline: integer("deadline").notNull(),
  state: text("state", { enum: ["running", "done", "failed"] }).notNull(),
  result: text("result"),
  refusal: text("refusal"),
  status: integer("status"),
});

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
  (table) => [uniqueIndex("item_tags_item_tag").on(table.itemId, table.tagId)],
);

export const catalogVersion = sqliteTable(
  "catalog_version",
  {
    id: integer("id").primaryKey(),
    version: integer("version").notNull().default(0),
  },
  (table) => [check("catalog_is_one_row", sql`${table.id} = 1`)],
);
