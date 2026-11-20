import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { REDDIT_ACCOUNT_STATES } from "../contract/reddit-account-state-names.ts";
import { listed } from "./schema-checks.ts";

export const ACCOUNT_ROW = 1;

export const redditAccount = sqliteTable(
  "reddit_account",
  {
    id: integer("id").primaryKey(),
    sealedSession: text("sealed_session").notNull(),
    state: text("state", { enum: REDDIT_ACCOUNT_STATES }).notNull(),
    stateAt: integer("state_at").notNull(),
    limitedUntil: integer("limited_until"),
    busyUntil: integer("busy_until"),
    busyJob: integer("busy_job"),
    busyAttempt: integer("busy_attempt"),
    queueHead: integer("queue_head"),
    lastRequestAt: integer("last_request_at"),
    refusedCount: integer("refused_count").notNull().default(0),
    refusedThreads: text("refused_threads").notNull().default("[]"),
    refusalsClearedAt: integer("refusals_cleared_at"),
    windowRemaining: integer("window_remaining"),
    windowResetsAt: integer("window_resets_at"),
    connectedAt: integer("connected_at").notNull(),
  },
  (table) => [
    check("reddit_account_is_one_row", sql`${table.id} = 1`),
    check("reddit_account_state", sql`${table.state} in (${listed(REDDIT_ACCOUNT_STATES)})`),
    check("reddit_account_refused_count", sql`${table.refusedCount} >= 0`),
  ],
);

export type AccountRow = typeof redditAccount.$inferSelect;
