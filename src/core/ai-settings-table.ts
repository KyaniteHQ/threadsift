import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { CLI_CHOICES } from "./ai-provider-contract.ts";

export const settings = sqliteTable(
  "settings",
  {
    id: integer("id").primaryKey(),
    provider: text("provider", {
      enum: [
        "openai-compatible",
        "openrouter",
        "anthropic",
        "openai",
        "xai",
        "workers-ai",
        "claude-code",
        "codex",
      ],
    }).notNull(),
    baseUrl: text("base_url"),
    model: text("model").notNull(),
    sealedKey: text("sealed_key"),
    effort: text("effort"),
    cliChoice: text("cli_choice", { enum: CLI_CHOICES }).notNull().default("custom"),
  },
  (table) => [
    check(
      "settings_cli_choice",
      sql`${table.cliChoice} = 'custom' or (${table.cliChoice} in ('recommended', 'cli-defaults') and ${table.provider} in ('claude-code', 'codex') and ${table.model} = '' and ${table.effort} is null)`,
    ),
    check(
      "settings_effort_provider",
      sql`${table.effort} is null or ${table.provider} in ('claude-code', 'codex')`,
    ),
    check("settings_is_one_row", sql`${table.id} = 1`),
    check(
      "settings_connection_columns",
      sql`(${table.provider} in ('workers-ai', 'claude-code', 'codex') and ${table.baseUrl} is null and ${table.sealedKey} is null) or (${table.provider} not in ('workers-ai', 'claude-code', 'codex') and ${table.baseUrl} is not null and ${table.sealedKey} is not null)`,
    ),
  ],
);
