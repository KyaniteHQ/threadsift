import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

import { providerMayRead } from "./digest-source.ts";
import { grokBotSettings } from "./grok-bot-tables.ts";
import { settings } from "./schema.ts";

export function grokBotChosen() {
  return sql`exists (select 1 from ${grokBotSettings} where ${grokBotSettings.id} = 1 and ${grokBotSettings.useAsProvider} = 1)`;
}

export function providerSet() {
  return sql`(exists (select 1 from ${settings} where ${settings.id} = 1) or ${grokBotChosen()})`;
}

export function providerReads(itemId: Readonly<SQLWrapper>): SQL {
  return sql`(${providerSet()} and ${providerMayRead(itemId)})`;
}
