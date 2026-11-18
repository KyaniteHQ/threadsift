import { z } from "zod";

import {
  PROVIDERS,
  CliChoiceSchema,
  CliPreferenceSchema,
  CliProviderSchema,
  HttpProviderSchema,
  type AiRefused,
  type CliAiConnection,
  refusedAi,
  withoutTrailingSlashes,
} from "./ai-contract.ts";
import type { AiSettingsInput } from "./ai-settings-contract.ts";
import type { settings } from "./ai-settings-tables.ts";
import type { AiPorts } from "./ports.ts";
import type { Sealer } from "./sealed-secret.ts";

export type ModelSettingsInput = Exclude<AiSettingsInput, { readonly provider: "grok-bot" }>;
type SettingsRow = Readonly<Omit<typeof settings.$inferSelect, "id">>;
type SettingsRefusal = AiRefused | { readonly kind: "recommendation-unavailable" };

export const StoredSettingsSchema = z.union([
  z.object({
    provider: z.literal(PROVIDERS["workers-ai"].id),
    model: z.string(),
    baseUrl: z.null(),
    sealedKey: z.null(),
  }),
  z
    .object({
      provider: CliProviderSchema,
      model: z.string(),
      baseUrl: z.null(),
      sealedKey: z.null(),
      effort: z.string().nullable(),
      cliChoice: CliChoiceSchema,
    })
    .transform(
      ({ provider, model, baseUrl, sealedKey, effort, cliChoice: choice }) =>
        ({
          provider,
          baseUrl,
          sealedKey,
          preference: CliPreferenceSchema.parse(
            choice === "custom" ? { choice, model, effort: effort ?? undefined } : { choice },
          ),
        }) as const,
    ),
  z.object({
    provider: HttpProviderSchema,
    model: z.string(),
    baseUrl: z.string(),
    sealedKey: z.string(),
  }),
]);

export type Stored = z.infer<typeof StoredSettingsSchema>;

export type Keyless = Extract<Stored, { readonly sealedKey: null }>;

async function nextCliSettings(
  ports: AiPorts,
  config: Readonly<CliAiConnection>,
  saved: Readonly<Stored> | undefined,
): Promise<SettingsRow | SettingsRefusal> {
  const { provider, choice } = config;
  if (
    choice === "recommended" &&
    ports.ai.recommendations[provider] === undefined &&
    !(saved?.provider === provider && saved.preference.choice === "recommended")
  )
    return { kind: "recommendation-unavailable" } as const;

  const selection = ports.ai.resolveCli(config);
  if (selection.kind === "refused") return selection;
  if (!(await ports.ai.signedIn()).includes(provider)) return refusedAi("not-configured");

  return {
    provider,
    model: choice === "custom" ? config.model : "",
    effort: choice === "custom" ? (config.effort ?? null) : null,
    cliChoice: choice,
    baseUrl: null,
    sealedKey: null,
  } as const;
}

export async function nextSettings(
  ports: AiPorts,
  { sealer, saved }: Readonly<{ sealer: Sealer | null; saved: Stored | undefined }>,
  input: Readonly<ModelSettingsInput>,
): Promise<SettingsRow | SettingsRefusal> {
  if (input.provider === "workers-ai")
    return { ...input, effort: null, cliChoice: "custom", baseUrl: null, sealedKey: null } as const;

  if ("choice" in input) return nextCliSettings(ports, { ...input, kind: "cli" }, saved);

  if (sealer === null) return refusedAi("secret-missing");

  const baseUrl =
    "baseUrl" in input ? withoutTrailingSlashes(input.baseUrl) : PROVIDERS[input.provider].url;

  if (!ports.ai.allowsUrl(baseUrl)) return refusedAi("refused");

  const same =
    saved !== undefined &&
    saved.sealedKey !== null &&
    saved.provider === input.provider &&
    saved.baseUrl === baseUrl &&
    saved.model === input.model;

  if (input.key === undefined && !same) return refusedAi("key-needed");

  const key = input.key ?? (same ? await sealer.open(saved.sealedKey) : null);

  if (key === null) return refusedAi("secret-missing");

  return {
    provider: input.provider,
    model: input.model,
    baseUrl,
    sealedKey: await sealer.seal(key),
    effort: null,
    cliChoice: "custom",
  } as const;
}
