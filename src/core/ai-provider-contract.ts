import { z } from "zod";

export const AI_URL_MAX = 2048;
export const AI_MODEL_MAX = 240;
export const AI_KEY_MAX = 4096;

const Model = z.string().trim().min(1).max(AI_MODEL_MAX);
const Key = z.string().min(1).max(AI_KEY_MAX).optional();
const CliModel = z.string().trim().max(AI_MODEL_MAX);

export const CLI_CHOICES = ["recommended", "cli-defaults", "custom"] as const;
export const CliChoiceSchema = z.enum(CLI_CHOICES);
export type CliChoice = z.infer<typeof CliChoiceSchema>;

function keyedProvider<const Id extends string, const Url extends string>(id: Id, url: Url) {
  return {
    id,
    label: id,
    url,
    names: ["model", "key"],
    fields: { model: Model, key: Key },
  } as const;
}

function cliProvider<const Id extends string, const Label extends string>(id: Id, label: Label) {
  return {
    id,
    label,
    url: null,
    names: ["model", "effort"],
    fields: {
      model: CliModel,
      effort: z
        .string()
        .trim()
        .transform((value) => (value === "" ? undefined : value))
        .optional(),
    },
  } as const;
}

export const PROVIDERS = {
  "openai-compatible": {
    id: "openai-compatible",
    label: "compatible",
    url: null,
    names: ["baseUrl", "model", "key"],
    fields: { baseUrl: z.url().max(AI_URL_MAX), model: Model, key: Key },
  },
  openrouter: keyedProvider("openrouter", "https://openrouter.ai/api/v1"),
  anthropic: keyedProvider("anthropic", "https://api.anthropic.com/v1"),
  openai: keyedProvider("openai", "https://api.openai.com/v1"),
  xai: keyedProvider("xai", "https://api.x.ai/v1"),
  "workers-ai": {
    id: "workers-ai",
    label: "workersAi",
    url: null,
    names: ["model"],
    fields: { model: Model },
  },
  "claude-code": cliProvider("claude-code", "claudeCode"),
  codex: cliProvider("codex", "codex"),
  "grok-bot": { id: "grok-bot", label: "grokBot", url: null, names: [], fields: {} },
} as const;

export const HttpProviderSchema = z.enum([
  PROVIDERS["openai-compatible"].id,
  PROVIDERS.openrouter.id,
  PROVIDERS.anthropic.id,
  PROVIDERS.openai.id,
  PROVIDERS.xai.id,
]);

export function withoutTrailingSlashes(url: string): string {
  return url.replace(/\/+$/u, "");
}

export const CliProviderSchema = z.enum([PROVIDERS["claude-code"].id, PROVIDERS.codex.id]);

export type CliProvider = z.infer<typeof CliProviderSchema>;

export function isCliProvider(provider: string): provider is CliProvider {
  return CliProviderSchema.safeParse(provider).success;
}

export const GROK_BOT_PROVIDER = PROVIDERS["grok-bot"].id;

export const ProviderSchema = z.enum([
  ...HttpProviderSchema.options,
  PROVIDERS["workers-ai"].id,
  ...CliProviderSchema.options,
  GROK_BOT_PROVIDER,
]);

export type Provider = z.infer<typeof ProviderSchema>;

function cliSettingsInput<const Id extends CliProvider>(id: Id) {
  return z
    .strictObject({
      provider: z.literal(id),
      ...PROVIDERS[id].fields,
      choice: CliChoiceSchema.optional(),
      model: CliModel.default(""),
    })
    .refine(
      ({ choice, model, effort }) =>
        choice === undefined || choice === "custom" || (model === "" && effort === undefined),
      { message: "Model and effort require the custom choice." },
    );
}

export const AiSettingsInputSchema = z.discriminatedUnion("provider", [
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
  cliSettingsInput("claude-code"),
  cliSettingsInput("codex"),
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

const CliRecommendationSchema = z.object({ model: z.string(), effort: z.string() }).readonly();

export type CliRecommendation = z.infer<typeof CliRecommendationSchema>;

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
