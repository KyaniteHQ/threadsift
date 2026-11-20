import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { items } from "./item-tables.ts";
import { JOB_KINDS, JOB_STATES, UNOWNED_JOB_KINDS, WAIT_REASONS } from "./job-contract.ts";
import { listed } from "./schema-checks.ts";

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
      .where(sql`${table.state} <> 'done'`),
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
