import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const grokBotSettings = sqliteTable(
  "grok_bot_settings",
  {
    id: integer("id").primaryKey(),
    webhookUrl: text("webhook_url").notNull(),
    sealedKey: text("sealed_key").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [check("grok_bot_settings_is_one_row", sql`${table.id} = 1`)],
);
