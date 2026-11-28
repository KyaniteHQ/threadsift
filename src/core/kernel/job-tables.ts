import { type SQL, type SQLWrapper, sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import {
  JOB_KINDS,
  JOB_STATES,
  type JobKind,
  type JobState,
  UNOWNED_JOB_KINDS,
  WAIT_REASONS,
} from "../contract/job-contract.ts";
import { topics } from "./catalog-tables.ts";
import { items } from "./item-tables.ts";
import { listed, literal } from "./schema-checks.ts";

const DONE = "done" satisfies JobState;

const TOPIC_OVERVIEW = "topic_overview" satisfies JobKind;

export function jobIs(state: JobState): SQL {
  return sql`${jobs.state} = ${literal(state)}`;
}

export function jobOpen(column: SQLWrapper = jobs.state): SQL {
  return sql`${column} <> ${literal(DONE)}`;
}

export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind", { enum: JOB_KINDS }).notNull(),
    itemId: integer("item_id").references(() => items.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    state: text("state", { enum: JOB_STATES }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    staleRequeues: integer("stale_requeues").notNull().default(0),
    attemptGeneration: integer("attempt_generation"),
    attemptPending: text("attempt_pending"),
    nextAttemptAt: integer("next_attempt_at").notNull(),
    claimExpires: integer("claim_expires"),
    waitReason: text("wait_reason", { enum: WAIT_REASONS }),
    page: text("page"),
    topicId: integer("topic_id").references(() => topics.id, { onDelete: "set null" }),
  },
  (table) => [
    check(
      "jobs_owner_check",
      sql`${table.kind} in (${listed(UNOWNED_JOB_KINDS)}) or ${table.itemId} is not null`,
    ),
    check(
      "jobs_values_check",
      sql`${table.kind} in (${listed(JOB_KINDS)}) and ${table.state} in (${listed(JOB_STATES)})`,
    ),
    uniqueIndex("jobs_one_open_per_item_kind")
      .on(table.itemId, table.kind)
      .where(sql`${jobOpen(table.state)} and ${table.kind} <> ${literal(TOPIC_OVERVIEW)}`),
    uniqueIndex("jobs_one_open_overview_per_item_topic")
      .on(table.itemId, table.topicId)
      .where(sql`${jobOpen(table.state)} and ${table.kind} = ${literal(TOPIC_OVERVIEW)}`),
    index("jobs_state_next_attempt").on(table.state, table.nextAttemptAt),
  ],
);

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

export type JobRow = typeof jobs.$inferSelect;
