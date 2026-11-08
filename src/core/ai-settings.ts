import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  PROVIDERS,
  CliProviderSchema,
  HttpProviderSchema,
  type AiSettingsInput,
  type AiSettingsView,
  type AiSaveResponseSchema,
  type BindingAiConnection,
  type CliAiConnection,
  type HttpAiConnection,
  refusedAi,
} from "./ai-contract.ts";
import type { JobWrites } from "./job-outcome.ts";
import type { AiPorts } from "./ports.ts";
import { settings } from "./schema.ts";
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

type LoadedAi =
  | { readonly state: "not-configured"; readonly sealer: Sealer | null }
  | { readonly state: "secret-missing"; readonly saved: Stored; readonly sealer: Sealer | null }
  | {
      readonly state: "ready";
      readonly saved: Stored;
      readonly config: HttpAiConnection | BindingAiConnection | CliAiConnection;
      readonly sealer: Sealer | null;
    };

export async function loadAiConfig(ports: AiPorts): Promise<LoadedAi> {
  const [row] = await ports.db.select().from(settings).where(eq(settings.id, 1));
  const sealer = ports.ai.secrets;

  if (row === undefined) return { state: "not-configured", sealer };
  const saved = StoredSettingsSchema.parse(row);

  if (saved.sealedKey === null)
    return { state: "ready", saved, sealer, config: keylessConnection(saved) };

  const key = sealer === null ? null : await sealer.open(saved.sealedKey);

  return key === null
    ? { state: "secret-missing", saved, sealer }
    : {
        state: "ready",
        saved,
        sealer,
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
  ports: AiPorts,
  secretReady: boolean,
): Promise<AiSettingsView> {
  return {
    settings: viewOf(saved),
    providers: ports.ai.providers,
    signedIn: await ports.ai.signedIn(),
    secretReady,
    publicOnly: ports.ai.publicOnly,
  };
}

function viewOf(saved: Stored | undefined): AiSettingsView["settings"] {
  if (saved === undefined) return null;

  return saved.sealedKey === null
    ? { provider: saved.provider, model: saved.model }
    : { provider: saved.provider, baseUrl: saved.baseUrl, model: saved.model, keySet: true };
}

export async function readAiSettings(ports: AiPorts): Promise<AiSettingsView> {
  const loaded = await loadAiConfig(ports);

  return aiView(
    loaded.state === "not-configured" ? undefined : loaded.saved,
    ports,
    loaded.sealer !== null && loaded.state !== "secret-missing",
  );
}

export async function saveAiSettings(
  ports: AiPorts,
  input: Readonly<AiSettingsInput>,
  extraWrites: () => JobWrites,
): Promise<z.infer<typeof AiSaveResponseSchema>> {
  const loaded = await loadAiConfig(ports);
  const next = await nextSettings(ports, loaded, input);

  if ("kind" in next) return next;

  const row = { id: 1, ...next };

  await ports.db.batch([
    ports.db.insert(settings).values(row).onConflictDoUpdate({ target: settings.id, set: row }),
    ...extraWrites(),
  ]);

  return aiView(next, ports, loaded.sealer !== null);
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

  if (sealer === null || loaded.state === "secret-missing") return refusedAi("secret-missing");

  const baseUrl =
    "baseUrl" in input ? input.baseUrl.replace(/\/+$/u, "") : PROVIDERS[input.provider].url;

  if (!ports.ai.allowsUrl(baseUrl)) return refusedAi("refused");

  const same =
    loaded.state === "ready" &&
    loaded.config.kind === "http" &&
    loaded.config.provider === input.provider &&
    loaded.config.baseUrl === baseUrl &&
    loaded.config.model === input.model;

  const key = input.key ?? (same ? loaded.config.key : null);

  if (key === null) return refusedAi("key-needed");

  return {
    provider: input.provider,
    model: input.model,
    baseUrl,
    sealedKey: await sealer.seal(key),
  } as const;
}
