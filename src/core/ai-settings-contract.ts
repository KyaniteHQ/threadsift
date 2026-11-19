import { z } from "zod";

import { AiRefusedSchema, CliRecommendationSchema } from "./ai-contract.ts";
import { DigestSchema } from "./digest-schema.ts";
import {
  CliChoiceSchema,
  CliPreferenceSchema,
  CliProviderSchema,
  HttpProviderSchema,
  ProviderSchema,
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
export type AiSaveResponse = z.infer<typeof AiSaveResponseSchema>;

export const VerifyResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("done"), taskId: z.number().int(), digest: DigestSchema }),
  AiRefusedSchema,
]);
