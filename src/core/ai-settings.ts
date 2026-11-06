import { eq } from "drizzle-orm";
import type { z } from "zod";

import {
  PROVIDERS,
  type AiSettingsInput,
  type AiSettingsView,
  type AiSaveResponseSchema,
  type AiConnection,
  refusedAi,
} from "./ai-contract.ts";
import type { Ports } from "./ports.ts";
import { settings } from "./schema.ts";

type AiRow = typeof settings.$inferSelect;

type LoadedAi =
  | { readonly state: "secret-missing"; readonly saved: AiRow | undefined }
  | { readonly state: "not-configured" }
  | { readonly state: "ready"; readonly saved: AiRow; readonly config: AiConnection };

export async function loadAiConfig(ports: Ports): Promise<LoadedAi> {
  const [saved] = await ports.db.select().from(settings).where(eq(settings.id, 1));

  if (ports.secrets === null) return { state: "secret-missing", saved };

  if (saved === undefined) return { state: "not-configured" };
  const key = await ports.secrets.open(saved.sealedKey);

  return key === null
    ? { state: "secret-missing", saved }
    : {
        state: "ready",
        saved,
        config: { provider: saved.provider, baseUrl: saved.baseUrl, model: saved.model, key },
      };
}

function aiView(
  saved: AiRow | undefined,
  secretReady: boolean,
  publicOnly: boolean,
): AiSettingsView {
  return {
    settings:
      saved === undefined
        ? null
        : { provider: saved.provider, baseUrl: saved.baseUrl, model: saved.model, keySet: true },
    secretReady,
    publicOnly,
  };
}

export async function readAiSettings(ports: Ports): Promise<AiSettingsView> {
  const loaded = await loadAiConfig(ports);

  return aiView(
    loaded.state === "not-configured" ? undefined : loaded.saved,
    loaded.state !== "secret-missing",
    ports.ai.publicOnly,
  );
}

export async function saveAiSettings(
  ports: Ports,
  input: Readonly<AiSettingsInput>,
): Promise<z.infer<typeof AiSaveResponseSchema>> {
  const loaded = await loadAiConfig(ports);

  if (loaded.state === "secret-missing" || ports.secrets === null)
    return refusedAi("secret-missing");

  const baseUrl =
    "baseUrl" in input ? input.baseUrl.replace(/\/+$/u, "") : PROVIDERS[input.provider].url;

  if (!ports.ai.allows(baseUrl)) return refusedAi("refused");

  const same =
    loaded.state === "ready" &&
    loaded.config.provider === input.provider &&
    loaded.config.baseUrl === baseUrl &&
    loaded.config.model === input.model;

  const key = input.key ?? (same ? loaded.config.key : null);

  if (key === null) return refusedAi("not-configured");

  const row = {
    id: 1,
    provider: input.provider,
    baseUrl,
    model: input.model,
    sealedKey: await ports.secrets.seal(key),
  };

  await ports.db.insert(settings).values(row).onConflictDoUpdate({ target: settings.id, set: row });

  return aiView(row, true, ports.ai.publicOnly);
}
