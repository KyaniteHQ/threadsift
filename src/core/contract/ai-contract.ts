import { z } from "zod";

import { utf8Length } from "./encoding.ts";
import {
  type BindingProvider,
  type CliProvider,
  CliPreferenceSchema,
  type HttpProvider,
} from "./provider-families.ts";

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
  "cli-not-started",
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

export function rejectsKeyWith400(
  provider: HttpProvider,
  status: number | undefined,
  message: string,
): boolean {
  return provider === "xai" && status === 400 && message.includes("Incorrect API key provided");
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
    case "cli-not-started":
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
  readonly provider: HttpProvider;
  readonly baseUrl: string;
  readonly model: string;
  readonly key: string;
}

interface BindingAiConnection {
  readonly kind: "binding";
  readonly provider: BindingProvider;
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

export const SETTINGS_CHANGED = "settings-changed";

export const AI_INPUT_BYTES = 14_000;

export function fitsAiInput(text: string): boolean {
  return utf8Length(text) <= AI_INPUT_BYTES;
}

export const AI_LIST_OUTPUT_TOKENS = 4096;

export const AI_REASON_MAX = 160;

export const BASE_OUTPUT_TOKENS = 2048;

export const MAX_OUTPUT_TOKENS = 8192;

export const AI_DEADLINE_MS = 10 * 60 * 1000;

export const VERIFY_INPUT =
  "A post on Notebook Weekly describes how a reading group keeps a shared notebook. Each reader records a useful passage and its source, then compares notes at the next meeting. The group keeps corrections beside the original passages so readers can see what changed.";
