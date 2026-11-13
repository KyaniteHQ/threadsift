import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const REDDIT_ACCOUNT_STATES = ["connected", "expired"] as const;

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
    queueHead: integer("queue_head"),
    lastRequestAt: integer("last_request_at"),
    refusedCount: integer("refused_count").notNull().default(0),
    refusedJob: integer("refused_job"),
    windowRemaining: integer("window_remaining"),
    windowResetsAt: integer("window_resets_at"),
    connectedAt: integer("connected_at").notNull(),
  },
  (table) => [
    check("reddit_account_is_one_row", sql`${table.id} = 1`),
    check("reddit_account_state", sql`${table.state} in ('connected', 'expired')`),
    check("reddit_account_refused_count", sql`${table.refusedCount} >= 0`),
  ],
);

export type AccountRow = typeof redditAccount.$inferSelect;
