import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import {
  CLI_CHOICES,
  CliProviderSchema,
  KEYLESS_PROVIDERS,
  type StoredProvider,
} from "./provider-families.ts";

function quotedList(ids: readonly string[]) {
  return sql.raw(`(${ids.map((id) => `'${id}'`).join(", ")})`);
}

const CLI = quotedList(CliProviderSchema.options);
const PRESETS = quotedList(CLI_CHOICES.filter((choice) => choice !== "custom"));
const KEYLESS = quotedList(KEYLESS_PROVIDERS);

export const settings = sqliteTable(
  "settings",
  {
    id: integer("id").primaryKey(),
    provider: text("provider").$type<StoredProvider>().notNull(),
    baseUrl: text("base_url"),
    model: text("model").notNull(),
    sealedKey: text("sealed_key"),
    effort: text("effort"),
    cliChoice: text("cli_choice", { enum: CLI_CHOICES }).notNull().default("custom"),
  },
  (table) => [
    check(
      "settings_cli_choice",
      sql`${table.cliChoice} = 'custom' or (${table.cliChoice} in ${PRESETS} and ${table.provider} in ${CLI} and ${table.model} = '' and ${table.effort} is null)`,
    ),
    check(
      "settings_custom_cli_overrides",
      sql`${table.cliChoice} <> 'custom' or ${table.provider} not in ${CLI} or trim(${table.model}) <> '' or nullif(trim(${table.effort}), '') is not null`,
    ),
    check("settings_effort_provider", sql`${table.effort} is null or ${table.provider} in ${CLI}`),
    check("settings_is_one_row", sql`${table.id} = 1`),
    check(
      "settings_connection_columns",
      sql`(${table.provider} in ${KEYLESS} and ${table.baseUrl} is null and ${table.sealedKey} is null) or (${table.provider} not in ${KEYLESS} and ${table.baseUrl} is not null and ${table.sealedKey} is not null)`,
    ),
  ],
);
