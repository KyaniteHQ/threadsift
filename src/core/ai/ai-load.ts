import { eq } from "drizzle-orm";

import type { ModelAi } from "../contract/ai-contract.ts";
import { GROK_BOT_PROVIDER } from "../contract/provider-families.ts";
import { readRevision } from "../kernel/ai-settings-revision.ts";
import { grokBotSettings } from "../kernel/grok-bot-tables.ts";
import type { AiPorts } from "../kernel/ports.ts";
import { UninitializedDatabase, settings } from "../kernel/schema.ts";
import { connectionOf, unreadyAsProvider } from "./grok-bot-ready.ts";
import { openedGrokBot } from "./grok-bot-settings.ts";
import { type Stored, StoredSettingsSchema } from "./provider-row.ts";

export interface Snapshot {
  readonly sealer: AiPorts["secrets"];
  readonly revision: number;
  readonly saved: Stored | undefined;
  readonly botSelected: boolean;
}

export type LoadedAi =
  | (Snapshot & ModelAi)
  | (Snapshot & { readonly state: typeof GROK_BOT_PROVIDER });

export async function loadAiConfig(ports: AiPorts): Promise<LoadedAi> {
  const [[row], [counter], [bot]] = await ports.db.batch([
    ports.db.select().from(settings).where(eq(settings.id, 1)),
    readRevision(ports.db),
    ports.db.select().from(grokBotSettings).where(eq(grokBotSettings.id, 1)),
  ]);

  if (counter === undefined) throw new UninitializedDatabase("ai_settings_revision");

  const snapshot = {
    sealer: ports.secrets,
    revision: counter.revision,
    saved: row === undefined ? undefined : StoredSettingsSchema.parse(row),
    botSelected: bot?.useAsProvider === true,
  };

  if (snapshot.botSelected)
    return botLoaded(
      snapshot,
      connectionOf(ports.secrets, await openedGrokBot(ports.secrets, bot)),
    );

  return modelLoaded(snapshot);
}

function botLoaded(
  snapshot: Readonly<Snapshot>,
  connection: ReturnType<typeof connectionOf>,
): LoadedAi {
  if (connection.kind === "ready") {
    return { ...snapshot, state: GROK_BOT_PROVIDER };
  }

  return { ...snapshot, state: unreadyAsProvider(connection.reason) };
}

async function modelLoaded(snapshot: Readonly<Snapshot>): Promise<Snapshot & ModelAi> {
  const { saved, sealer } = snapshot;

  if (saved === undefined) return { ...snapshot, state: "not-configured" };

  return { ...snapshot, ...(await saved.connect(sealer)) };
}
