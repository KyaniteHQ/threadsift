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
  JSONParseError,
  TypeValidationError,
} from "ai";

import {
  type AiExecution,
  type AiTaskRequest,
  type HttpAiConnection,
  refusedAi,
} from "../../core/ai-contract.ts";
import { AiAddressRefused } from "../../core/ai-url.ts";
import { AI_CALL_OPTIONS } from "./ai-call-options.ts";
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

function apiRefusal(status: number | undefined) {
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
      ...AI_CALL_OPTIONS,
    });

    return { kind: "done", result: result.output };
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

  if (NoObjectGeneratedError.isInstance(cause)) return unusableAnswer(cause.finishReason);
  const parseError = APICallError.isInstance(cause) ? cause.cause : cause;

  if (JSONParseError.isInstance(parseError) || TypeValidationError.isInstance(parseError))
    return refusedAi("no-json", APICallError.isInstance(cause) ? (cause.statusCode ?? null) : null);

  return APICallError.isInstance(cause) ? apiRefusal(cause.statusCode) : refusedAi("unreachable");
}

function unusableAnswer(finishReason: FinishReason | undefined) {
  if (finishReason === "content-filter") return refusedAi("declined");

  return finishReason === "length" ? refusedAi("cut-off") : refusedAi("no-json");
}
