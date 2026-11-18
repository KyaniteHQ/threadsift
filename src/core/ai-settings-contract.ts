import { z } from "zod";

import {
  AiRefusedSchema,
  CliChoiceSchema,
  CliPreferenceSchema,
  CliProviderSchema,
  CliRecommendationSchema,
  DigestSchema,
  GROK_BOT_PROVIDER,
  HttpProviderSchema,
  PROVIDERS,
  ProviderSchema,
} from "./ai-contract.ts";

const [recommended, defaults, custom] = CliPreferenceSchema.options;
const cliProvider = { provider: CliProviderSchema };

export const AiSettingsInputSchema = z.union([
  z.strictObject({
    provider: z.literal(PROVIDERS["openai-compatible"].id),
    ...PROVIDERS["openai-compatible"].fields,
  }),
  z.strictObject({ provider: z.literal(PROVIDERS.openrouter.id), ...PROVIDERS.openrouter.fields }),
  z.strictObject({ provider: z.literal(PROVIDERS.anthropic.id), ...PROVIDERS.anthropic.fields }),
  z.strictObject({ provider: z.literal(PROVIDERS.openai.id), ...PROVIDERS.openai.fields }),
  z.strictObject({ provider: z.literal(PROVIDERS.xai.id), ...PROVIDERS.xai.fields }),
  z.strictObject({
    provider: z.literal(PROVIDERS["workers-ai"].id),
    ...PROVIDERS["workers-ai"].fields,
  }),
  z.discriminatedUnion("choice", [
    recommended.safeExtend(cliProvider),
    defaults.safeExtend(cliProvider),
    custom.safeExtend(cliProvider),
  ]),
  z.strictObject({ provider: z.literal(GROK_BOT_PROVIDER) }),
]);

export type AiSettingsInput = z.infer<typeof AiSettingsInputSchema>;

const HttpSettingsViewSchema = z.object({
  provider: HttpProviderSchema,
  baseUrl: z.string(),
  model: z.string(),
  keySet: z.boolean(),
  keyReadable: z.boolean(),
});

const KeylessSettingsViewSchema = z.object({
  provider: z.enum([PROVIDERS["workers-ai"].id, GROK_BOT_PROVIDER]),
  model: z.string(),
});

export const AiSettingsViewSchema = z.object({
  settings: z
    .union([
      HttpSettingsViewSchema,
      KeylessSettingsViewSchema,
      z.object({
        provider: CliProviderSchema,
        choice: CliChoiceSchema,
        model: z.string(),
        effort: z.string(),
      }),
    ])
    .nullable(),
  providers: z.array(ProviderSchema).readonly(),
  signedIn: z.array(CliProviderSchema).readonly(),
  recommendations: z.partialRecord(CliProviderSchema, CliRecommendationSchema),
  secretReady: z.boolean(),
  publicOnly: z.boolean(),
  revision: z.number().int().min(0),
  connect: z.boolean(),
});

export type AiSettingsView = z.infer<typeof AiSettingsViewSchema>;

export const AiSaveResponseSchema = z.union([AiSettingsViewSchema, AiRefusedSchema]);
export type AiSaveResponse = z.infer<typeof AiSaveResponseSchema>;

export const VerifyResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("done"), taskId: z.number().int(), digest: DigestSchema }),
  AiRefusedSchema,
]);
