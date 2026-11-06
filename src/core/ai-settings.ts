import { eq } from "drizzle-orm";
import type { z } from "zod";

import {
  PROVIDERS,
  type AiSettingsInput,
  type AiSettingsView,
  type AiSaveResponseSchema,
  type HttpAiConnection,
  refusedAi,
} from "./ai-contract.ts";
import type { AiPorts } from "./ports.ts";
import { settings } from "./schema.ts";
import type { Sealer } from "./sealed-secret.ts";

type AiRow = typeof settings.$inferSelect;

type LoadedAi =
  | { readonly state: "secret-missing"; readonly saved: AiRow | undefined }
  | { readonly state: "not-configured"; readonly sealer: Sealer }
  | {
      readonly state: "ready";
      readonly saved: AiRow;
      readonly config: HttpAiConnection;
      readonly sealer: Sealer;
    };

export async function loadAiConfig(ports: AiPorts): Promise<LoadedAi> {
  const [saved] = await ports.db.select().from(settings).where(eq(settings.id, 1));

  if (ports.ai.secrets === null) return { state: "secret-missing", saved };

  if (saved === undefined) return { state: "not-configured", sealer: ports.ai.secrets };
  const key = await ports.ai.secrets.open(saved.sealedKey);

  return key === null
    ? { state: "secret-missing", saved }
    : {
        state: "ready",
        saved,
        sealer: ports.ai.secrets,
        config: {
          kind: "http",
          provider: saved.provider,
          baseUrl: saved.baseUrl,
          model: saved.model,
          key,
        },
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

export async function readAiSettings(ports: AiPorts): Promise<AiSettingsView> {
  const loaded = await loadAiConfig(ports);

  return aiView(
    loaded.state === "not-configured" ? undefined : loaded.saved,
    loaded.state !== "secret-missing",
    ports.ai.publicOnly,
  );
}

export async function saveAiSettings(
  ports: AiPorts,
  input: Readonly<AiSettingsInput>,
): Promise<z.infer<typeof AiSaveResponseSchema>> {
  const loaded = await loadAiConfig(ports);

  if (loaded.state === "secret-missing") return refusedAi("secret-missing");

  const baseUrl =
    "baseUrl" in input ? input.baseUrl.replace(/\/+$/u, "") : PROVIDERS[input.provider].url;

  if (!ports.ai.allowsUrl(baseUrl)) return refusedAi("refused");

  const same =
    loaded.state === "ready" &&
    loaded.config.provider === input.provider &&
    loaded.config.baseUrl === baseUrl &&
    loaded.config.model === input.model;

  const key = input.key ?? (same ? loaded.config.key : null);

  if (key === null) return refusedAi("key-needed");

  const row = {
    id: 1,
    provider: input.provider,
    baseUrl,
    model: input.model,
    sealedKey: await loaded.sealer.seal(key),
  };

  await ports.db.insert(settings).values(row).onConflictDoUpdate({ target: settings.id, set: row });

  return aiView(row, true, ports.ai.publicOnly);
}
