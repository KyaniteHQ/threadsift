import { type SQL, eq, ne, sql } from "drizzle-orm";

import { GROK_BOT_WAIT } from "../../../core/contract/job-contract.ts";
import { X_INTAKE_TASK } from "../../../core/contract/x-intake-contract.ts";
import { CURRENT_REVISION, bumpedRevision } from "../../../core/kernel/ai-settings-revision.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { grokBotSettings } from "../../../core/kernel/grok-bot-tables.ts";
import type { JobWrites } from "../../../core/kernel/job-outcome.ts";
import { waitingFor, wokenJobs } from "../../../core/kernel/job-waiting.ts";
import type { SettingsPorts } from "../../../core/kernel/ports.ts";
import { jobs } from "../../../core/kernel/schema.ts";
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
    wokenJobs(db, now, waitingFor(GROK_BOT_WAIT), ne(jobs.kind, "fetch")),
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
