import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const vaultSettings = sqliteTable(
  "vault_settings",
  {
    id: integer("id").primaryKey(),
    repository: text("repository").notNull(),
    branch: text("branch").notNull(),
    sealedToken: text("sealed_token").notNull(),
    generation: integer("generation").notNull().default(0),
    leaseUntil: integer("lease_until").notNull().default(0),
    nextAttemptAt: integer("next_attempt_at").notNull().default(0),
  },
  (table) => [check("vault_settings_one_row", sql`${table.id} = 1`)],
);

export const mirrorPaths = sqliteTable("mirror_paths", {
  sequence: integer("sequence").primaryKey({ autoIncrement: true }),
  itemId: integer("item_id").notNull().unique(),
});

export const mirrorFiles = sqliteTable("mirror_files", {
  path: text("path").primaryKey(),
  itemId: integer("item_id").notNull(),
});
