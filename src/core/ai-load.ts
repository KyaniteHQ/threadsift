import { eq } from "drizzle-orm";

import { type AiConnection, type ModelAi } from "./ai-contract.ts";
import { type Keyless, type Stored, StoredSettingsSchema } from "./ai-next-settings.ts";
import { grokBotSettings } from "./grok-bot-tables.ts";
import { connectionOf, openedGrokBot } from "./grok-bot.ts";
import type { AiPorts, Database } from "./ports.ts";
import { aiSettingsRevision, settings } from "./schema.ts";

export interface Snapshot {
  readonly sealer: AiPorts["secrets"];
  readonly revision: number;
  readonly saved: Stored | undefined;
  readonly botSelected: boolean;
}

export type LoadedAi = (Snapshot & ModelAi) | (Snapshot & { readonly state: "grok-bot" });

export function readRevision(db: Database) {
  return db
    .select({ revision: aiSettingsRevision.revision })
    .from(aiSettingsRevision)
    .where(eq(aiSettingsRevision.id, 1));
}

export async function loadAiConfig(ports: AiPorts): Promise<LoadedAi> {
  const [[row], [counter], [bot]] = await ports.db.batch([
    ports.db.select().from(settings).where(eq(settings.id, 1)),
    readRevision(ports.db),
    ports.db.select().from(grokBotSettings).where(eq(grokBotSettings.id, 1)),
  ]);

  const snapshot = {
    sealer: ports.secrets,
    revision: counter?.revision ?? 0,
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
    return { ...snapshot, state: "grok-bot" };
  }

  return {
    ...snapshot,
    state: connection.reason === "secret-missing" ? "secret-missing" : "not-configured",
  };
}

async function modelLoaded(snapshot: Readonly<Snapshot>): Promise<Snapshot & ModelAi> {
  const { saved, sealer } = snapshot;

  if (saved === undefined) return { ...snapshot, state: "not-configured" };

  if (saved.sealedKey === null)
    return { ...snapshot, state: "ready", config: keylessConnection(saved) };

  const key = sealer === null ? null : await sealer.open(saved.sealedKey);

  return key === null
    ? { ...snapshot, state: "secret-missing" }
    : {
        ...snapshot,
        state: "ready",
        config: {
          kind: "http",
          provider: saved.provider,
          baseUrl: saved.baseUrl,
          model: saved.model,
          key,
        },
      };
}

function keylessConnection(saved: Readonly<Keyless>): AiConnection {
  return saved.provider === "workers-ai"
    ? { kind: "binding", provider: saved.provider, model: saved.model }
    : { kind: "cli", provider: saved.provider, model: saved.model };
}
