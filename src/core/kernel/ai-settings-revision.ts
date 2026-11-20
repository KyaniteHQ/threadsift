import { eq, sql } from "drizzle-orm";
import { check, integer, sqliteTable } from "drizzle-orm/sqlite-core";

import type { Database } from "./database.ts";

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

export const CURRENT_REVISION = sql<number>`(select ${aiSettingsRevision.revision} from ${aiSettingsRevision} where ${aiSettingsRevision.id} = 1)`;

export function readRevision(db: Database) {
  return db
    .select({ revision: aiSettingsRevision.revision })
    .from(aiSettingsRevision)
    .where(eq(aiSettingsRevision.id, 1));
}

export function bumpedRevision(db: Database) {
  return db
    .update(aiSettingsRevision)
    .set({ revision: sql`${aiSettingsRevision.revision} + 1` })
    .where(eq(aiSettingsRevision.id, 1));
}
