import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { sessions } from "./access-tables.ts";

export const aiSettingsRevision = sqliteTable(
  "ai_settings_revision",
  {
    id: integer("id").primaryKey().notNull(),
    revision: integer("revision").notNull().default(0),
  },
  (table) => [
    check("ai_settings_revision_is_one_row", sql`${table.id} = 1`),
    check("ai_settings_revision_not_negative", sql`${table.revision} >= 0`),
  ],
);

export const openrouterConnectTransactions = sqliteTable(
  "openrouter_connect_transactions",
  {
    stateDigest: text("state_digest").primaryKey().notNull(),
    sessionDigest: text("session_digest")
      .notNull()
      .references(() => sessions.digest, { onDelete: "cascade" }),
    sealedVerifier: text("sealed_verifier").notNull(),
    model: text("model").notNull(),
    expectedRevision: integer("expected_revision").notNull(),
    publicOrigin: text("public_origin").notNull(),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [
    check("openrouter_connect_revision_not_negative", sql`${table.expectedRevision} >= 0`),
    check("openrouter_connect_expires_after_created", sql`${table.expiresAt} > ${table.createdAt}`),
    index("openrouter_connect_expires_at").on(table.expiresAt),
    index("openrouter_connect_session").on(table.sessionDigest),
  ],
);

export const CURRENT_REVISION = sql<number>`(select ${aiSettingsRevision.revision} from ${aiSettingsRevision} where ${aiSettingsRevision.id} = 1)`;

export const DATABASE_NOW = sql<number>`cast((julianday('now') - 2440587.5) * 86400000 as integer)`;
