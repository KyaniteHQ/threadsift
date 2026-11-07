import { z } from "zod";

const ShortText = z.string().trim().min(1).max(240);
export const AI_URL_MAX = 2048;
export const AI_MODEL_MAX = 240;
export const AI_KEY_MAX = 4096;

const KEPT_COMMENTS_MAX = 2000;

const CommentId = z
  .string()
  .regex(/^t1_[a-z\d]+$/iu)
  .max(32);

export const ModelDigestSchema = z.object({
  title: ShortText,
  topic: ShortText,
  tags: z.array(ShortText).max(3).readonly(),
  summary: z
    .string()
    .trim()
    .min(1)
    .max(1200)
    .refine((text) => text.split(/\r\n|\r|\n/u).length <= 2),
  keyPoints: z.array(z.string().trim().min(1).max(1200)).min(1).max(12).readonly(),
});

export const DigestSchema = ModelDigestSchema.extend({
  keptComments: z.array(CommentId).max(KEPT_COMMENTS_MAX).readonly().optional(),
});

const Model = z.string().trim().min(1).max(AI_MODEL_MAX);
const Key = z.string().min(1).max(AI_KEY_MAX).optional();
const CliModel = z.string().trim().max(AI_MODEL_MAX);

function keyedProvider<const Id extends string, const Url extends string>(id: Id, url: Url) {
  return {
    id,
    label: id,
    url,
    names: ["model", "key"],
    fields: { model: Model, key: Key },
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
  "claude-code": {
    id: "claude-code",
    label: "claudeCode",
    url: null,
    names: ["model"],
    fields: { model: CliModel },
  },
} as const;

export const HttpProviderSchema = z.enum([
  PROVIDERS["openai-compatible"].id,
  PROVIDERS.openrouter.id,
  PROVIDERS.anthropic.id,
  PROVIDERS.openai.id,
  PROVIDERS.xai.id,
]);

export const CliProviderSchema = z.enum([PROVIDERS["claude-code"].id]);

export type CliProvider = z.infer<typeof CliProviderSchema>;

export const ProviderSchema = z.enum([
  ...HttpProviderSchema.options,
  PROVIDERS["workers-ai"].id,
  ...CliProviderSchema.options,
]);

export type Provider = z.infer<typeof ProviderSchema>;

export const AiSettingsInputSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal(PROVIDERS["openai-compatible"].id),
    ...PROVIDERS["openai-compatible"].fields,
  }),
  z.object({ provider: z.literal(PROVIDERS.openrouter.id), ...PROVIDERS.openrouter.fields }),
  z.object({ provider: z.literal(PROVIDERS.anthropic.id), ...PROVIDERS.anthropic.fields }),
  z.object({ provider: z.literal(PROVIDERS.openai.id), ...PROVIDERS.openai.fields }),
  z.object({ provider: z.literal(PROVIDERS.xai.id), ...PROVIDERS.xai.fields }),
  z.object({ provider: z.literal(PROVIDERS["workers-ai"].id), ...PROVIDERS["workers-ai"].fields }),
  z.object({
    provider: z.literal(PROVIDERS["claude-code"].id),
    ...PROVIDERS["claude-code"].fields,
  }),
]);

const AiExecutionRefusalSchema = z.enum([
  "wrong-key",
  "model-not-found",
  "no-json",
  "declined",
  "cut-off",
  "unreachable",
  "timeout",
  "refused",
  "provider-busy",
  "not-configured",
]);

export const AiRefusalSchema = z.enum([
  ...AiExecutionRefusalSchema.options,
  "provider-unavailable",
  "key-needed",
  "secret-missing",
]);

export type AiRefusal = z.infer<typeof AiRefusalSchema>;

export type AiSettingsInput = z.infer<typeof AiSettingsInputSchema>;

export type Digest = z.infer<typeof DigestSchema>;

export function parseStoredDigest(stored: string): Digest {
  return DigestSchema.parse(JSON.parse(stored));
}

export const ReaderDigestSchema = DigestSchema.pick({ summary: true, keyPoints: true, tags: true });

export type ReaderDigest = z.infer<typeof ReaderDigestSchema>;

const HttpSettingsViewSchema = z.object({
  provider: HttpProviderSchema,
  baseUrl: z.string(),
  model: z.string(),
  keySet: z.boolean(),
});

const KeylessSettingsViewSchema = z.object({
  provider: z.enum([PROVIDERS["workers-ai"].id, ...CliProviderSchema.options]),
  model: z.string(),
});

export const AiSettingsViewSchema = z.object({
  settings: z.union([HttpSettingsViewSchema, KeylessSettingsViewSchema]).nullable(),
  providers: z.array(ProviderSchema).readonly(),
  signedIn: z.array(CliProviderSchema).readonly(),
  secretReady: z.boolean(),
  publicOnly: z.boolean(),
});

export type AiSettingsView = z.infer<typeof AiSettingsViewSchema>;

const AiRefusedSchema = z.object({
  kind: z.literal("refused"),
  reason: AiRefusalSchema,
  status: z.number().int().nullable(),
});

export const VerifyResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("done"), taskId: z.number().int(), digest: DigestSchema }),
  AiRefusedSchema,
]);

export type AiRefused = Extract<z.infer<typeof VerifyResultSchema>, { readonly kind: "refused" }>;

export const AiSaveResponseSchema = z.union([AiSettingsViewSchema, AiRefusedSchema]);

export function refusedAi<Reason extends AiRefusal>(
  reason: Reason,
  status: number | null = null,
): AiRefused & { readonly reason: Reason } {
  return { kind: "refused", reason, status };
}

export function retriesAi({ reason, status }: Readonly<AiRefused>): boolean {
  switch (reason) {
    case "unreachable":
    case "timeout":
    case "provider-busy":
      return true;
    case "no-json":
      return status === null || (status >= 200 && status < 300);
    case "wrong-key":
    case "model-not-found":
    case "declined":
    case "cut-off":
    case "refused":
    case "provider-unavailable":
    case "key-needed":
    case "not-configured":
    case "secret-missing":
      return false;
    default: {
      const exhaustive: never = reason;

      return exhaustive;
    }
  }
}

export type AiConnection = HttpAiConnection | BindingAiConnection | CliAiConnection;

export interface HttpAiConnection {
  readonly kind: "http";
  readonly provider: z.infer<typeof HttpProviderSchema>;
  readonly baseUrl: string;
  readonly model: string;
  readonly key: string;
}

export interface BindingAiConnection {
  readonly kind: "binding";
  readonly provider: "workers-ai";
  readonly model: string;
}

export interface CliAiConnection {
  readonly kind: "cli";
  readonly provider: CliProvider;
  readonly model: string;
}

export function modelOf({ model }: Readonly<Pick<AiConnection, "model">>): string | null {
  return model === "" ? null : model;
}

export type AiExecution<Result> =
  | { readonly kind: "done"; readonly result: Result }
  | (AiRefused & { readonly reason: z.infer<typeof AiExecutionRefusalSchema> });

export interface AiTaskDefinition<Result> {
  readonly kind: string;
  readonly instructions: string;
  readonly schema: z.ZodType<Result>;
  readonly prepareInput: (input: string) => string;
}

export interface AiTaskRequest<Result> {
  readonly config: AiConnection;
  readonly instructions: string;
  readonly schema: z.ZodType<Result>;
  readonly input: string;
}

export const AI_DEADLINE_MS = 10 * 60 * 1000;

export const VERIFY_INPUT =
  "A post on Notebook Weekly describes how a reading group keeps a shared notebook. Each reader records a useful passage and its source, then compares notes at the next meeting. The group keeps corrections beside the original passages so readers can see what changed.";
