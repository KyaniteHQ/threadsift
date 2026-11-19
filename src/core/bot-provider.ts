import { and, eq, ne, sql } from "drizzle-orm";

import { refusedAi } from "./ai-contract.ts";
import { loadAiConfig } from "./ai-load.ts";
import { abandonedTasks } from "./bot-task-rows.ts";
import type { Database } from "./database.ts";
import { grokBotSettings } from "./grok-bot-tables.ts";
import { grokBotConnection } from "./grok-bot.ts";
import type { JobWrites } from "./job-outcome.ts";
import { CURRENT_REVISION } from "./openrouter-tables.ts";
import type { SettingsPorts } from "./ports.ts";
import { aiSettingsRevision, jobs } from "./schema.ts";
import { X_INTAKE_TASK } from "./x-intake-contract.ts";

function selectGrokBotWrites(db: Database): JobWrites {
  return [
    db.update(grokBotSettings).set({ useAsProvider: true }).where(eq(grokBotSettings.id, 1)),
    db
      .update(aiSettingsRevision)
      .set({ revision: sql`${aiSettingsRevision.revision} + 1` })
      .where(eq(aiSettingsRevision.id, 1)),
  ];
}

export function leaveGrokBotWrites(db: Database, now: number): JobWrites {
  return [
    db.update(grokBotSettings).set({ useAsProvider: false }).where(eq(grokBotSettings.id, 1)),
    abandonedTasks(db, X_INTAKE_TASK),
    db
      .update(jobs)
      .set({ nextAttemptAt: now })
      .where(
        and(eq(jobs.state, "queued"), eq(jobs.waitReason, "grok-bot"), ne(jobs.kind, "fetch")),
      ),
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
