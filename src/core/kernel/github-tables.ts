import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const githubSettings = sqliteTable(
  "github_settings",
  {
    id: integer("id").primaryKey(),
    sealedToken: text("sealed_token").notNull(),
  },
  (table) => [check("github_settings_is_one_row", sql`${table.id} = 1`)],
);

export const githubCooldown = sqliteTable(
  "github_cooldown",
  {
    id: integer("id").primaryKey(),
    until: integer("until").notNull(),
  },
  (table) => [check("github_cooldown_is_one_row", sql`${table.id} = 1`)],
);
