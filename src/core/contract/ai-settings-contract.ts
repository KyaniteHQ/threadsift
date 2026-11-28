import { z } from "zod";

import { AiRefusedSchema, CliRecommendationSchema } from "./ai-contract.ts";
import { DigestSchema } from "./digest-schema.ts";
import {
  AI_MODEL_MAX,
  AI_URL_MAX,
  CliChoiceSchema,
  CliPreferenceSchema,
  CliProviderSchema,
  HttpProviderSchema,
  KeyInputSchema,
  PROVIDERS,
  ProviderSchema,
  STORED_PROVIDERS,
  familiesOf,
} from "./provider-families.ts";

const [recommended, defaults, custom] = CliPreferenceSchema.options;
const cliProvider = { provider: CliProviderSchema };

export const AiSettingsInputSchema = z.union([
  ...familiesOf("http").map(({ input }) => input),
  ...familiesOf("binding").map(({ input }) => input),
  z.discriminatedUnion("choice", [
    recommended.safeExtend(cliProvider),
    defaults.safeExtend(cliProvider),
    custom.safeExtend(cliProvider),
  ]),
  ...familiesOf("bot").map(({ input }) => input),
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
  provider: z.enum(familiesOf("binding", "bot").map(({ id }) => id)),
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

export const MODEL_LIST_PAGES = 3;

export const MODEL_LIST_SOURCES = ["provider", "cli", "fixed"] as const;

export const MODEL_UNLISTED_REASONS = [
  "key-needed",
  "wrong-key",
  "unreachable",
  "no-list",
  "refused",
] as const;

export type ModelUnlistedReason = (typeof MODEL_UNLISTED_REASONS)[number];

const ModelOptionSchema = z
  .object({
    id: z.string().min(1).max(AI_MODEL_MAX),
    label: z.string().min(1).optional(),
    efforts: z.array(z.string().min(1)).readonly().optional(),
  })
  .readonly();

export type ModelOption = z.infer<typeof ModelOptionSchema>;

export const ModelListSchema = z.union([
  z
    .object({
      kind: z.literal("listed"),
      source: z.enum(MODEL_LIST_SOURCES),
      models: z.array(ModelOptionSchema).readonly(),
    })
    .readonly(),
  z.object({ kind: z.literal("unlisted"), reason: z.enum(MODEL_UNLISTED_REASONS) }).readonly(),
]);

export type ModelList = z.infer<typeof ModelListSchema>;

export const ModelListRequestSchema = z
  .strictObject({
    provider: z.enum(STORED_PROVIDERS),
    baseUrl: z.url().max(AI_URL_MAX).optional(),
    key: KeyInputSchema,
  })
  .refine(
    ({ provider, baseUrl }) => "baseUrl" in PROVIDERS[provider].fields === (baseUrl !== undefined),
    { message: "baseUrl is required for openai-compatible and refused for every other Provider." },
  );

export type ModelListRequest = z.infer<typeof ModelListRequestSchema>;

export const VerifyResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("done"), taskId: z.number().int(), digest: DigestSchema }),
  AiRefusedSchema,
]);
