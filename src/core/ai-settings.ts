import { eq } from "drizzle-orm";

import type { AiRefusal, AiSettingsInput } from "./ai-contract.ts";
import { allowedAiUrl } from "./ai-url.ts";
import type { Ports } from "./ports.ts";
import { settings } from "./schema.ts";
import { sealedSecrets } from "./sealed-secret.ts";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1";

export async function savedAi(ports: Ports) {
  const [saved] = await ports.db.select().from(settings).where(eq(settings.id, 1));

  return saved;
}

export async function readAiSettings(ports: Ports) {
  const saved = await savedAi(ports);
  const key = await sealedSecrets(ports.secretKey);

  const secretReady =
    key !== null && (saved === undefined || (await key.open(saved.sealedKey)) !== null);

  return {
    settings:
      saved === undefined
        ? null
        : { provider: saved.provider, baseUrl: saved.baseUrl, model: saved.model, keySet: true },
    secretReady,
    publicOnly: ports.ai.publicOnly,
  };
}

export async function saveAiSettings(
  ports: Ports,
  input: Readonly<AiSettingsInput>,
): Promise<AiRefusal | null> {
  const saved = await savedAi(ports);
  const key = await sealedSecrets(ports.secretKey);
  const previous = key === null || saved === undefined ? null : await key.open(saved.sealedKey);

  if (key === null || (saved !== undefined && previous === null)) {
    return "secret-missing";
  }

  const baseUrl =
    input.provider === "openrouter" ? OPENROUTER_URL : input.baseUrl.replace(/\/+$/u, "");

  if (!allowedAiUrl(baseUrl, ports.ai.publicOnly)) {
    return "refused";
  }

  const same =
    saved?.provider === input.provider && saved.baseUrl === baseUrl && saved.model === input.model;

  const value = input.key ?? (same ? previous : null);

  if (value === null) {
    return "not-configured";
  }

  const row = {
    id: 1,
    provider: input.provider,
    baseUrl,
    model: input.model,
    sealedKey: await key.seal(value),
  };

  await ports.db.insert(settings).values(row).onConflictDoUpdate({ target: settings.id, set: row });

  return null;
}
