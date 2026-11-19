import { z } from "zod";

export {
  DigestSchema,
  ModelDigestSchema,
  StoredDigestSchema,
  ReaderDigestSchema,
  parseStoredDigest,
  type Digest,
  type ReaderDigest,
} from "./digest-schema.ts";

export const AI_URL_MAX = 2048;
export const AI_MODEL_MAX = 240;
export const AI_KEY_MAX = 4096;

const Model = z.string().trim().min(1).max(AI_MODEL_MAX);
const Key = z.string().min(1).max(AI_KEY_MAX).optional();
const CliModel = z.string().trim().max(AI_MODEL_MAX);
const CliEffort = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();

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
    fields: { model: CliModel, effort: CliEffort },
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

export const CliPreferenceSchema = z.discriminatedUnion("choice", [
  z.strictObject({ choice: z.literal("recommended") }),
  z.strictObject({ choice: z.literal("cli-defaults") }),
  z
    .strictObject({ choice: z.literal("custom"), model: CliModel.default(""), effort: CliEffort })
    .refine(({ model, effort }) => model !== "" || effort !== undefined, {
      message: "Custom requires a model or effort.",
    }),
]);

export const CliRecommendationSchema = z
  .object({ model: z.string(), effort: z.string() })
  .readonly();

export type CliRecommendation = z.infer<typeof CliRecommendationSchema>;

type ParsedCliPreference = Readonly<z.infer<typeof CliPreferenceSchema>>;
type CustomPreference = Extract<ParsedCliPreference, { choice: "custom" }>;
export type CliPreference =
  | CustomPreference
  | (Exclude<ParsedCliPreference, CustomPreference> & Readonly<{ model?: never; effort?: never }>);

const AiExecutionRefusalSchema = z.enum([
  "invalid-effort",
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
  "provider-unavailable",
]);

export const AiRefusalSchema = z.enum([
  ...AiExecutionRefusalSchema.options,
  "key-needed",
  "secret-missing",
]);

export type AiRefusal = z.infer<typeof AiRefusalSchema>;

export const AiRefusedSchema = z.object({
  kind: z.literal("refused"),
  reason: AiRefusalSchema,
  status: z.number().int().nullable(),
  levels: z.array(z.string()).readonly().optional(),
});

export type AiRefused = z.infer<typeof AiRefusedSchema>;

export function refusedAi<Reason extends AiRefusal>(
  reason: Reason,
  status: number | null = null,
): AiRefused & { readonly reason: Reason } {
  return { kind: "refused", reason, status };
}

export function apiRefusal(status: number | undefined) {
  if (status === undefined) return refusedAi("unreachable");

  switch (status) {
    case 401:
    case 403:
      return refusedAi("wrong-key", status);
    case 400:
    case 422:
      return refusedAi("no-json", status);
    case 404:
      return refusedAi("model-not-found", status);
    default:
      return status === 429 || status >= 500
        ? refusedAi("provider-busy", status)
        : refusedAi("unreachable", status);
  }
}

export function retriesAi({ reason, status }: Readonly<AiRefused>): boolean {
  switch (reason) {
    case "unreachable":
    case "timeout":
    case "provider-busy":
      return true;
    case "no-json":
      return status === null || (status >= 200 && status < 300);
    case "invalid-effort":
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

export type AiConnection = HttpAiConnection | BindingAiConnection | ResolvedCliConnection;

export type ModelAi =
  | { readonly state: "not-configured" | "secret-missing" }
  | {
      readonly state: "ready";
      readonly config: HttpAiConnection | BindingAiConnection | CliAiConnection;
    };

export interface HttpAiConnection {
  readonly kind: "http";
  readonly provider: z.infer<typeof HttpProviderSchema>;
  readonly baseUrl: string;
  readonly model: string;
  readonly key: string;
}

interface BindingAiConnection {
  readonly kind: "binding";
  readonly provider: "workers-ai";
  readonly model: string;
}

export type CliAiConnection = Readonly<{ kind: "cli"; provider: CliProvider }> & CliPreference;

export interface ResolvedCliConnection {
  readonly kind: "cli";
  readonly provider: CliProvider;
  readonly effort: string | undefined;
  readonly model: string;
}

export type CliSelection =
  | ResolvedCliConnection
  | (AiRefused & { readonly reason: "invalid-effort" | "model-not-found" | "not-configured" });

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
  readonly maxOutputTokens: number;
}

export const BASE_OUTPUT_TOKENS = 2048;

export const MAX_OUTPUT_TOKENS = 8192;

export const AI_DEADLINE_MS = 10 * 60 * 1000;

export const VERIFY_INPUT =
  "A post on Notebook Weekly describes how a reading group keeps a shared notebook. Each reader records a useful passage and its source, then compares notes at the next meeting. The group keeps corrections beside the original passages so readers can see what changed.";
