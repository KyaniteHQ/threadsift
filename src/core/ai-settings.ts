import { sql } from "drizzle-orm";

import {
  GROK_BOT_PROVIDER,
  type AiSettingsInput,
  type AiSettingsView,
  type AiSaveResponse,
} from "./ai-contract.ts";
import { type LoadedAi, type Snapshot, loadAiConfig } from "./ai-load.ts";
import { type ModelSettingsInput, nextSettings } from "./ai-next-settings.ts";
import { leaveGrokBotWrites, preparedBot } from "./bot-provider.ts";
import { guardedBatch } from "./guards.ts";
import type { JobWrites } from "./job-outcome.ts";
import { CURRENT_REVISION } from "./openrouter-tables.ts";
import type { Database, SettingsPorts } from "./ports.ts";
import { settings } from "./schema.ts";

async function aiView(loaded: LoadedAi, ports: SettingsPorts): Promise<AiSettingsView> {
  return {
    settings: viewOf(loaded, loaded.state !== "secret-missing"),
    providers: ports.ai.providers,
    signedIn: await ports.ai.signedIn(),
    secretReady: ports.secrets !== null,
    publicOnly: ports.ai.publicOnly,
    revision: loaded.revision,
    connect: ports.publicOrigin !== null,
  };
}

function viewOf(
  { saved, botSelected }: Readonly<Snapshot>,
  keyReadable: boolean,
): AiSettingsView["settings"] {
  if (botSelected) return { provider: GROK_BOT_PROVIDER, model: "" };

  if (saved === undefined) return null;

  return saved.sealedKey === null
    ? { provider: saved.provider, model: saved.model }
    : {
        provider: saved.provider,
        baseUrl: saved.baseUrl,
        model: saved.model,
        keySet: true,
        keyReadable,
      };
}

export async function readAiSettings(ports: SettingsPorts): Promise<AiSettingsView> {
  return aiView(await loadAiConfig(ports), ports);
}

export async function prepareAiSettings(ports: SettingsPorts, input: Readonly<ModelSettingsInput>) {
  const loaded = await loadAiConfig(ports);
  const next = await nextSettings(ports, loaded, input);

  return "kind" in next
    ? next
    : ({
        row: { id: 1, ...next },
        revision: loaded.revision,
        leavesBot: loaded.botSelected,
      } as const);
}

type Prepared = Exclude<
  Awaited<ReturnType<typeof prepareAiSettings>>,
  { readonly kind: "refused" }
>;

export type PreparedSave = Prepared;

type PreparedSettings = Prepared["row"];

export function providerWrites(db: Database, { row, leavesBot }: Readonly<Prepared>): JobWrites {
  return [
    db.insert(settings).values(row).onConflictDoUpdate({ target: settings.id, set: row }),
    ...(leavesBot ? leaveGrokBotWrites(db, Date.now()) : []),
  ];
}

export async function holdsSettings(
  db: Database,
  row: Readonly<PreparedSettings>,
): Promise<boolean> {
  try {
    const [stored] = await db.select().from(settings);

    return (
      stored !== undefined &&
      "sealedKey" in row &&
      stored.sealedKey === row.sealedKey &&
      stored.provider === row.provider &&
      stored.model === row.model
    );
  } catch {
    return false;
  }
}

const SAVE_ATTEMPTS = 5;

async function preparedSave(ports: SettingsPorts, input: Readonly<AiSettingsInput>) {
  if (input.provider === GROK_BOT_PROVIDER) return preparedBot(ports);

  const prepared = await prepareAiSettings(ports, input);

  if ("kind" in prepared) return prepared;

  return {
    guard: sql`${CURRENT_REVISION} = ${prepared.revision}`,
    writes: providerWrites(ports.db, prepared),
  };
}

export async function saveAiSettings(
  ports: SettingsPorts,
  input: Readonly<AiSettingsInput>,
  extraWrites: () => JobWrites,
  attemptsLeft = SAVE_ATTEMPTS,
): Promise<AiSaveResponse> {
  const prepared = await preparedSave(ports, input);

  if ("kind" in prepared) return prepared;

  const written = await guardedBatch(ports.db, prepared.guard, [
    ...prepared.writes,
    ...extraWrites(),
  ]);

  if (written) return readAiSettings(ports);

  if (attemptsLeft <= 1) throw new Error("The AI settings changed during every attempt to save.");

  return saveAiSettings(ports, input, extraWrites, attemptsLeft - 1);
}
