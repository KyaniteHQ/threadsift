import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import {
  PROVIDERS,
  CliProviderSchema,
  HttpProviderSchema,
  type AiSettingsInput,
  type AiSettingsView,
  type AiSaveResponseSchema,
  type BindingAiConnection,
  type AiRefused,
  type CliAiConnection,
  type HttpAiConnection,
  refusedAi,
  withoutTrailingSlashes,
} from "./ai-contract.ts";
import { guardedBatch } from "./guards.ts";
import type { JobWrites } from "./job-outcome.ts";
import { CURRENT_REVISION } from "./openrouter-tables.ts";
import type { AiPorts, Database, SettingsPorts } from "./ports.ts";
import { aiSettingsRevision, settings } from "./schema.ts";
import type { Sealer } from "./sealed-secret.ts";

const StoredSettingsSchema = z.union([
  z.object({
    provider: z.enum([PROVIDERS["workers-ai"].id, ...CliProviderSchema.options]),
    model: z.string(),
    baseUrl: z.null(),
    sealedKey: z.null(),
  }),
  z.object({
    provider: HttpProviderSchema,
    model: z.string(),
    baseUrl: z.string(),
    sealedKey: z.string(),
  }),
]);

type Stored = z.infer<typeof StoredSettingsSchema>;

type Keyless = Extract<Stored, { readonly sealedKey: null }>;

interface Snapshot {
  readonly sealer: Sealer | null;
  readonly revision: number;
}

type LoadedAi =
  | (Snapshot & { readonly state: "not-configured" })
  | (Snapshot & { readonly state: "secret-missing"; readonly saved: Stored })
  | (Snapshot & {
      readonly state: "ready";
      readonly saved: Stored;
      readonly config: HttpAiConnection | BindingAiConnection | CliAiConnection;
    });

export function readRevision(db: Database) {
  return db
    .select({ revision: aiSettingsRevision.revision })
    .from(aiSettingsRevision)
    .where(eq(aiSettingsRevision.id, 1));
}

export async function loadAiConfig(ports: AiPorts): Promise<LoadedAi> {
  const [[row], [counter]] = await ports.db.batch([
    ports.db.select().from(settings).where(eq(settings.id, 1)),
    readRevision(ports.db),
  ]);

  const snapshot = { sealer: ports.secrets, revision: counter?.revision ?? 0 };
  const { sealer } = snapshot;

  if (row === undefined) return { ...snapshot, state: "not-configured" };
  const saved = StoredSettingsSchema.parse(row);

  if (saved.sealedKey === null)
    return { ...snapshot, state: "ready", saved, config: keylessConnection(saved) };

  const key = sealer === null ? null : await sealer.open(saved.sealedKey);

  return key === null
    ? { ...snapshot, state: "secret-missing", saved }
    : {
        ...snapshot,
        state: "ready",
        saved,
        config: {
          kind: "http",
          provider: saved.provider,
          baseUrl: saved.baseUrl,
          model: saved.model,
          key,
        },
      };
}

function keylessConnection(saved: Readonly<Keyless>): BindingAiConnection | CliAiConnection {
  return saved.provider === "workers-ai"
    ? { kind: "binding", provider: saved.provider, model: saved.model }
    : { kind: "cli", provider: saved.provider, model: saved.model };
}

async function aiView(
  saved: Stored | undefined,
  ports: SettingsPorts,
  state: Readonly<{ keyReadable: boolean; revision: number }>,
): Promise<AiSettingsView> {
  return {
    settings: viewOf(saved, state.keyReadable),
    providers: ports.ai.providers,
    signedIn: await ports.ai.signedIn(),
    secretReady: ports.secrets !== null,
    publicOnly: ports.ai.publicOnly,
    revision: state.revision,
    connect: ports.publicOrigin !== null,
  };
}

function viewOf(saved: Stored | undefined, keyReadable: boolean): AiSettingsView["settings"] {
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
  const loaded = await loadAiConfig(ports);

  return aiView(loaded.state === "not-configured" ? undefined : loaded.saved, ports, {
    keyReadable: loaded.state !== "secret-missing",
    revision: loaded.revision,
  });
}

export async function prepareAiSettings(ports: SettingsPorts, input: Readonly<AiSettingsInput>) {
  const loaded = await loadAiConfig(ports);
  const next = await nextSettings(ports, loaded, input);

  return "kind" in next ? next : ({ row: { id: 1, ...next }, revision: loaded.revision } as const);
}

export type PreparedSettings = Exclude<
  Awaited<ReturnType<typeof prepareAiSettings>>,
  AiRefused
>["row"];

export function upsertSettings(db: Database, row: Readonly<PreparedSettings>) {
  return db.insert(settings).values(row).onConflictDoUpdate({ target: settings.id, set: row });
}

const SAVE_ATTEMPTS = 5;

export async function saveAiSettings(
  ports: SettingsPorts,
  input: Readonly<AiSettingsInput>,
  extraWrites: () => JobWrites,
  attemptsLeft = SAVE_ATTEMPTS,
): Promise<z.infer<typeof AiSaveResponseSchema>> {
  const prepared = await prepareAiSettings(ports, input);

  if ("kind" in prepared) return prepared;

  const written = await guardedBatch(ports.db, sql`${CURRENT_REVISION} = ${prepared.revision}`, [
    upsertSettings(ports.db, prepared.row),
    ...extraWrites(),
  ]);

  if (written) return readAiSettings(ports);

  if (attemptsLeft <= 1) throw new Error("The AI settings changed during every attempt to save.");

  return saveAiSettings(ports, input, extraWrites, attemptsLeft - 1);
}

function keylessRow(provider: Keyless["provider"], model: string) {
  return { provider, model, baseUrl: null, sealedKey: null } as const;
}

async function nextSettings(ports: AiPorts, loaded: LoadedAi, input: Readonly<AiSettingsInput>) {
  if (input.provider === "workers-ai") return keylessRow(input.provider, input.model);

  if (input.provider === "claude-code" || input.provider === "codex")
    return (await ports.ai.signedIn()).includes(input.provider)
      ? keylessRow(input.provider, input.model)
      : refusedAi("not-configured");

  const { sealer } = loaded;

  if (sealer === null) return refusedAi("secret-missing");

  const baseUrl =
    "baseUrl" in input ? withoutTrailingSlashes(input.baseUrl) : PROVIDERS[input.provider].url;

  if (!ports.ai.allowsUrl(baseUrl)) return refusedAi("refused");

  const same =
    loaded.state !== "not-configured" &&
    loaded.saved.provider === input.provider &&
    loaded.saved.baseUrl === baseUrl &&
    loaded.saved.model === input.model;

  if (input.key === undefined && !same) return refusedAi("key-needed");

  const key =
    input.key ??
    (loaded.state === "ready" && loaded.config.kind === "http" ? loaded.config.key : null);

  if (key === null) return refusedAi("secret-missing");

  return {
    provider: input.provider,
    model: input.model,
    baseUrl,
    sealedKey: await sealer.seal(key),
  } as const;
}
