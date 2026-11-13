import { z } from "zod";

import {
  PROVIDERS,
  CliProviderSchema,
  HttpProviderSchema,
  type AiSettingsInput,
  refusedAi,
  withoutTrailingSlashes,
} from "./ai-contract.ts";
import type { AiPorts } from "./ports.ts";
import type { Sealer } from "./sealed-secret.ts";

export type ModelSettingsInput = Exclude<AiSettingsInput, { readonly provider: "grok-bot" }>;

export const StoredSettingsSchema = z.union([
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

export type Stored = z.infer<typeof StoredSettingsSchema>;

export type Keyless = Extract<Stored, { readonly sealedKey: null }>;

function keylessRow(provider: Keyless["provider"], model: string) {
  return { provider, model, baseUrl: null, sealedKey: null } as const;
}

export async function nextSettings(
  ports: AiPorts,
  { sealer, saved }: Readonly<{ sealer: Sealer | null; saved: Stored | undefined }>,
  input: Readonly<ModelSettingsInput>,
) {
  if (input.provider === "workers-ai") return keylessRow(input.provider, input.model);

  if (input.provider === "claude-code" || input.provider === "codex")
    return (await ports.ai.signedIn()).includes(input.provider)
      ? keylessRow(input.provider, input.model)
      : refusedAi("not-configured");

  if (sealer === null) return refusedAi("secret-missing");

  const baseUrl =
    "baseUrl" in input ? withoutTrailingSlashes(input.baseUrl) : PROVIDERS[input.provider].url;

  if (!ports.ai.allowsUrl(baseUrl)) return refusedAi("refused");

  const same =
    saved?.provider === input.provider && saved.baseUrl === baseUrl && saved.model === input.model;

  if (input.key === undefined && !same) return refusedAi("key-needed");

  const key =
    input.key ?? (same && saved.sealedKey !== null ? await sealer.open(saved.sealedKey) : null);

  if (key === null) return refusedAi("secret-missing");

  return {
    provider: input.provider,
    model: input.model,
    baseUrl,
    sealedKey: await sealer.seal(key),
  } as const;
}
