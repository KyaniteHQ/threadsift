import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { APICallError, NoObjectGeneratedError, Output, generateText } from "ai";

import {
  DigestSchema,
  DIGEST_INSTRUCTIONS,
  cutDigestInput,
  type AiRefusal,
  type Digest,
} from "./ai-contract.ts";
import { AiAddressRefused } from "./ai-url.ts";
import type { Ports } from "./ports.ts";
import type { settings } from "./schema.ts";

type AiConfig = typeof settings.$inferSelect;

export type AiExecution =
  | { readonly kind: "done"; readonly digest: Digest }
  | {
      readonly kind: "refused";
      readonly reason: AiRefusal;
      readonly status: number | null;
    };

export function refusedAi(
  reason: AiRefusal,
  status: number | null = null,
): Extract<AiExecution, { readonly kind: "refused" }> {
  return { kind: "refused", reason, status };
}

function apiRefusal(status: number | undefined): AiExecution {
  switch (status) {
    case 401:
      return refusedAi("wrong-key", 401);
    case 403:
      return refusedAi("wrong-key", 403);
    case 404:
      return refusedAi("model-not-found", 404);
    case undefined:
      return refusedAi("unreachable");

    default:
      return refusedAi("unreachable", status ?? null);
  }
}

export async function executeDigest(
  ports: Ports,
  saved: Readonly<AiConfig>,
  key: string,
  input: string,
  signal: AbortSignal,
): Promise<AiExecution> {
  const provider = createOpenAICompatible({
    name: saved.provider,
    baseURL: saved.baseUrl,
    apiKey: key,
    supportsStructuredOutputs: true,
    fetch: ports.ai.fetch,
  });

  try {
    const result = await generateText({
      model: provider(saved.model),
      output: Output.object({ schema: DigestSchema }),
      instructions: DIGEST_INSTRUCTIONS,
      prompt: cutDigestInput(input),
      maxOutputTokens: 2048,
      maxRetries: 0,
      abortSignal: signal,
      telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
    });

    const parsed = DigestSchema.safeParse(result.output);

    return parsed.success ? { kind: "done", digest: parsed.data } : refusedAi("no-json");
  } catch (error) {
    if (signal.aborted) {
      return refusedAi("timeout");
    }

    if (
      error instanceof AiAddressRefused ||
      (APICallError.isInstance(error) && error.cause instanceof AiAddressRefused)
    ) {
      return refusedAi("refused");
    }

    if (NoObjectGeneratedError.isInstance(error)) {
      return refusedAi("no-json");
    }

    return APICallError.isInstance(error) ? apiRefusal(error.statusCode) : refusedAi("unreachable");
  }
}
