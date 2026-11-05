import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { KINDS, SOURCES, THROTTLE_KINDS } from "./kinds.ts";

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
    fetchedAt: integer("fetched_at"),
  },
  (table) => [index("items_saved_at_id").on(table.savedAt, table.id)],
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

export type AgentTokenRow = typeof agentTokens.$inferSelect;
