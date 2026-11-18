import { z } from "zod";

import {
  AiSettingsViewSchema,
  type CliChoice,
  type CliProvider,
  HttpProviderSchema,
} from "./ai-provider-contract.ts";
import { DigestSchema } from "./digest-schema.ts";

export {
  DigestSchema,
  ModelDigestSchema,
  StoredDigestSchema,
  ReaderDigestSchema,
  parseStoredDigest,
  type Digest,
  type ReaderDigest,
} from "./digest-schema.ts";

export {
  AI_URL_MAX,
  AI_MODEL_MAX,
  AI_KEY_MAX,
  AiSettingsInputSchema,
  type AiSettingsInput,
  AiSettingsViewSchema,
  type AiSettingsView,
  CliChoiceSchema,
  type CliChoice,
  CliProviderSchema,
  type CliProvider,
  type CliRecommendation,
  GROK_BOT_PROVIDER,
  HttpProviderSchema,
  PROVIDERS,
  ProviderSchema,
  type Provider,
  isCliProvider,
  withoutTrailingSlashes,
} from "./ai-provider-contract.ts";

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

const AiRefusedSchema = z.object({
  kind: z.literal("refused"),
  reason: AiRefusalSchema,
  status: z.number().int().nullable(),
  levels: z.array(z.string()).readonly().optional(),
});

export const VerifyResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("done"), taskId: z.number().int(), digest: DigestSchema }),
  AiRefusedSchema,
]);

export type AiRefused = Extract<z.infer<typeof VerifyResultSchema>, { readonly kind: "refused" }>;

export const AiSaveResponseSchema = z.union([AiSettingsViewSchema, AiRefusedSchema]);

export type AiSaveResponse = z.infer<typeof AiSaveResponseSchema>;

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

export type AiConnection = HttpAiConnection | BindingAiConnection | CliAiConnection;

export type ModelAi =
  | { readonly state: "not-configured" | "secret-missing" }
  | { readonly state: "ready"; readonly config: AiConnection };

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

export interface CliAiConnection {
  readonly kind: "cli";
  readonly provider: CliProvider;
  readonly choice: CliChoice;
  readonly effort: string | undefined;
  readonly model: string;
}

export type CliSelection =
  | CliAiConnection
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
