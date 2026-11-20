import { type SQL, and, eq, ne, sql } from "drizzle-orm";

import { GROK_BOT_WAIT } from "../contract/job-contract.ts";
import { X_INTAKE_TASK } from "../contract/x-intake-contract.ts";
import { CURRENT_REVISION, bumpedRevision } from "../kernel/ai-settings-revision.ts";
import type { Database } from "../kernel/database.ts";
import { grokBotSettings } from "../kernel/grok-bot-tables.ts";
import type { JobWrites } from "../kernel/job-outcome.ts";
import { waitingFor, wokenJobs } from "../kernel/job-waiting.ts";
import type { SettingsPorts } from "../kernel/ports.ts";
import { jobs } from "../kernel/schema.ts";
import { loadAiConfig } from "./ai-load.ts";
import { abandonedTasks } from "./bot-task-rows.ts";
import { grokBotConnection, unreadyAsProvider } from "./grok-bot-ready.ts";

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
