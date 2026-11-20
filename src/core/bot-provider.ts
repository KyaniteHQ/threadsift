import { type SQL, and, eq, ne, sql } from "drizzle-orm";

import { loadAiConfig } from "./ai-load.ts";
import { CURRENT_REVISION, bumpedRevision } from "./ai-settings-revision.ts";
import { abandonedTasks } from "./bot-task-rows.ts";
import type { Database } from "./database.ts";
import { grokBotConnection, unreadyAsProvider } from "./grok-bot-ready.ts";
import { grokBotSettings } from "./grok-bot-tables.ts";
import { GROK_BOT_WAIT } from "./job-contract.ts";
import type { JobWrites } from "./job-outcome.ts";
import { waitingFor, wokenJobs } from "./job-waiting.ts";
import type { SettingsPorts } from "./ports.ts";
import { jobs } from "./schema.ts";
import { X_INTAKE_TASK } from "./x-intake-contract.ts";

export interface BotFirst {
  readonly kind: "bot-first";
  readonly code: ReturnType<typeof unreadyAsProvider>;
}

function selectGrokBotWrites(db: Database): JobWrites {
  return [
    db.update(grokBotSettings).set({ useAsProvider: true }).where(eq(grokBotSettings.id, 1)),
    bumpedRevision(db),
  ];
}

export function leaveGrokBotWrites(db: Database, now: number): JobWrites {
  return [
    db.update(grokBotSettings).set({ useAsProvider: false }).where(eq(grokBotSettings.id, 1)),
    abandonedTasks(db, X_INTAKE_TASK),
    wokenJobs(db, now, and(waitingFor(GROK_BOT_WAIT), ne(jobs.kind, "fetch"))),
  ];
}

type PreparedBot = BotFirst | { readonly guard: SQL; readonly writes: JobWrites };

export async function preparedBot(ports: SettingsPorts): Promise<PreparedBot> {
  const connection = await grokBotConnection(ports);

  if (connection.kind === "unready")
    return { kind: "bot-first", code: unreadyAsProvider(connection.reason) };

  const loaded = await loadAiConfig(ports);

  return {
    guard: sql`${CURRENT_REVISION} = ${loaded.revision} and exists (select 1 from ${grokBotSettings} where ${grokBotSettings.id} = 1)`,
    writes: loaded.botSelected ? [] : selectGrokBotWrites(ports.db),
  };
}
