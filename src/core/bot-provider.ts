import { eq, sql } from "drizzle-orm";

import { refusedAi } from "./ai-contract.ts";
import { loadAiConfig } from "./ai-load.ts";
import { abandonedTasks } from "./bot-task-states.ts";
import { grokBotSettings } from "./grok-bot-tables.ts";
import { grokBotConnection } from "./grok-bot.ts";
import type { JobWrites } from "./job-outcome.ts";
import { CURRENT_REVISION } from "./openrouter-tables.ts";
import type { SettingsPorts } from "./ports.ts";
import { aiSettingsRevision } from "./schema.ts";

function selectGrokBotWrites(db: SettingsPorts["db"]): JobWrites {
  return [
    db.update(grokBotSettings).set({ useAsProvider: true }).where(eq(grokBotSettings.id, 1)),
    db
      .update(aiSettingsRevision)
      .set({ revision: sql`${aiSettingsRevision.revision} + 1` })
      .where(eq(aiSettingsRevision.id, 1)),
  ];
}

export function leaveGrokBotWrites(db: SettingsPorts["db"], now: number): JobWrites {
  return [
    db.update(grokBotSettings).set({ useAsProvider: false }).where(eq(grokBotSettings.id, 1)),
    ...abandonedTasks(db, now),
  ];
}

export async function preparedBot(ports: SettingsPorts) {
  const connection = await grokBotConnection(ports);

  if (connection.kind === "unready")
    return refusedAi(connection.reason === "secret-missing" ? "secret-missing" : "not-configured");

  const loaded = await loadAiConfig(ports);

  return {
    guard: sql`${CURRENT_REVISION} = ${loaded.revision} and exists (select 1 from ${grokBotSettings} where ${grokBotSettings.id} = 1)`,
    writes: loaded.botSelected ? [] : selectGrokBotWrites(ports.db),
  };
}
