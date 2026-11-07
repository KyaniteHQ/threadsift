import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  PROVIDERS,
  HttpProviderSchema,
  type AiSettingsInput,
  type AiSettingsView,
  type AiSaveResponseSchema,
  type BindingAiConnection,
  type HttpAiConnection,
  refusedAi,
} from "./ai-contract.ts";
import type { JobWrites } from "./job-outcome.ts";
import type { AiPorts } from "./ports.ts";
import { settings } from "./schema.ts";
import type { Sealer } from "./sealed-secret.ts";

const StoredSettingsSchema = z.union([
  z.object({
    provider: z.literal(PROVIDERS["workers-ai"].id),
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

type LoadedAi =
  | { readonly state: "not-configured"; readonly sealer: Sealer | null }
  | { readonly state: "secret-missing"; readonly saved: Stored; readonly sealer: Sealer | null }
  | {
      readonly state: "ready";
      readonly saved: Stored;
      readonly config: HttpAiConnection | BindingAiConnection;
      readonly sealer: Sealer | null;
    };

export async function loadAiConfig(ports: AiPorts): Promise<LoadedAi> {
  const [row] = await ports.db.select().from(settings).where(eq(settings.id, 1));
  const sealer = ports.ai.secrets;

  if (row === undefined) return { state: "not-configured", sealer };
  const saved = StoredSettingsSchema.parse(row);

  if (saved.provider === "workers-ai") {
    return {
      state: "ready",
      saved,
      sealer,
      config: { kind: "binding", provider: saved.provider, model: saved.model },
    };
  }

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

function aiView(saved: Stored | undefined, ports: AiPorts, secretReady: boolean): AiSettingsView {
  return {
    settings: viewOf(saved),
    providers: ports.ai.providers,
    secretReady,
    publicOnly: ports.ai.publicOnly,
  };
}

function viewOf(saved: Stored | undefined): AiSettingsView["settings"] {
  if (saved === undefined) return null;

  return saved.provider === "workers-ai"
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

async function nextSettings(ports: AiPorts, loaded: LoadedAi, input: Readonly<AiSettingsInput>) {
  if (input.provider === "workers-ai") {
    return {
      provider: input.provider,
      model: input.model,
      baseUrl: null,
      sealedKey: null,
    } as const;
  }

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
