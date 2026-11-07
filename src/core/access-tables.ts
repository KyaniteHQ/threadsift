import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { THROTTLE_KINDS } from "./kinds.ts";

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

export const spentResetCodes = sqliteTable("spent_reset_codes", {
  digest: text("digest").primaryKey(),
  spentAt: integer("spent_at").notNull(),
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

export type AgentTokenRow = typeof agentTokens.$inferSelect;
