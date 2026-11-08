import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createXai } from "@ai-sdk/xai";
import {
  generateText,
  Output,
  type FinishReason,
  APICallError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  JSONParseError,
  TypeValidationError,
} from "ai";
import { z } from "zod";

import {
  type AiExecution,
  type AiTaskRequest,
  type HttpAiConnection,
  refusedAi,
} from "../../core/ai-contract.ts";
import { AiAddressRefused } from "../../core/ai-url.ts";
import { AI_CALL_OPTIONS, apiRefusal } from "./ai-call.ts";
import { aiTransport } from "./ai-transport.ts";

function languageModel(config: Readonly<HttpAiConnection>, request: typeof fetch) {
  const settings = { baseURL: config.baseUrl, apiKey: config.key, fetch: aiTransport(request) };

  switch (config.provider) {
    case "anthropic":
      return createAnthropic(settings).languageModel(config.model);
    case "openai":
      return createOpenAI(settings).responses(config.model);
    case "xai":
      return createXai(settings).responses(config.model);
    case "openrouter":
    case "openai-compatible":
      return createOpenAICompatible({
        ...settings,
        name: config.provider,
        supportsStructuredOutputs: true,
      })(config.model);
    default: {
      const exhaustive: never = config.provider;

      return exhaustive;
    }
  }
}

function rejectsKeyWith400(
  provider: HttpAiConnection["provider"],
  status: number | undefined,
  message: string,
) {
  return provider === "xai" && status === 400 && message.includes("Incorrect API key provided");
}

export async function runHttp<Result>(
  request: typeof fetch,
  task: AiTaskRequest<Result>,
  signal: AbortSignal,
): Promise<AiExecution<Result>> {
  const { config } = task;

  if (config.kind !== "http") return refusedAi("unreachable");

  try {
    const result = await generateText({
      model: languageModel(config, request),
      output: Output.object({ schema: task.schema }),
      instructions: task.instructions,
      prompt: task.input,
      abortSignal: signal,
      maxOutputTokens: task.maxOutputTokens,
      ...AI_CALL_OPTIONS,
    });

    const unusable = unusableFinish(result.finishReason);

    return unusable ?? { kind: "done", result: result.output };
  } catch (error) {
    if (signal.aborted) return refusedAi("timeout");

    return executionRefusal(error, config.provider);
  }
}

function executionRefusal(cause: unknown, provider: HttpAiConnection["provider"]) {
  if (
    cause instanceof AiAddressRefused ||
    (APICallError.isInstance(cause) && cause.cause instanceof AiAddressRefused)
  )
    return refusedAi("refused");

  if (
    APICallError.isInstance(cause) &&
    rejectsKeyWith400(provider, cause.statusCode, cause.message)
  )
    return refusedAi("wrong-key", cause.statusCode);

  if (APICallError.isInstance(cause) && cause.statusCode !== undefined && cause.statusCode >= 400)
    return apiRefusal(cause.statusCode);

  if (NoObjectGeneratedError.isInstance(cause))
    return unusableFinish(cause.finishReason) ?? refusedAi("no-json");

  if (NoOutputGeneratedError.isInstance(cause)) return refusedAi("no-json");
  const parseError = APICallError.isInstance(cause) ? cause.cause : cause;

  if (holdsRefusalPart(parseError)) return refusedAi("declined");

  if (JSONParseError.isInstance(parseError) || TypeValidationError.isInstance(parseError))
    return refusedAi("no-json", APICallError.isInstance(cause) ? (cause.statusCode ?? null) : null);

  return APICallError.isInstance(cause) ? apiRefusal(cause.statusCode) : refusedAi("unreachable");
}

function unusableFinish(finishReason: FinishReason | undefined) {
  if (finishReason === "content-filter") return refusedAi("declined");

  return finishReason === "length" ? refusedAi("cut-off") : null;
}

const RefusalResponseSchema = z.object({
  output: z.array(z.object({ content: z.array(z.object({ type: z.string() })).optional() })),
});

function holdsRefusalPart(cause: unknown): boolean {
  if (!TypeValidationError.isInstance(cause)) return false;
  const response = RefusalResponseSchema.safeParse(cause.value);

  return (
    response.success &&
    response.data.output.some((item) =>
      (item.content ?? []).some((part) => part.type === "refusal"),
    )
  );
}
