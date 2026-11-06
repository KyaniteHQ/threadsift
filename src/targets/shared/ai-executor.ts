import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  generateText,
  Output,
  APICallError,
  NoObjectGeneratedError,
  JSONParseError,
  TypeValidationError,
} from "ai";

import { type AiExecution, type AiTaskRequest, refusedAi } from "../../core/ai-contract.ts";
import { AiAddressRefused } from "../../core/ai-url.ts";
import { AI_CALL_OPTIONS } from "./ai-call-options.ts";
import { aiTransport } from "./ai-transport.ts";

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
  try {
    if (task.config.kind !== "http") return refusedAi("unreachable");

    const provider = createOpenAICompatible({
      name: task.config.provider,
      baseURL: task.config.baseUrl,
      apiKey: task.config.key,
      supportsStructuredOutputs: true,
      fetch: aiTransport(request),
    });

    const result = await generateText({
      model: provider(task.config.model),
      output: Output.object({ schema: task.schema }),
      instructions: task.instructions,
      prompt: task.input,
      abortSignal: signal,
      ...AI_CALL_OPTIONS,
    });

    return { kind: "done", result: result.output };
  } catch (error) {
    if (signal.aborted) return refusedAi("timeout");

    if (
      error instanceof AiAddressRefused ||
      (APICallError.isInstance(error) && error.cause instanceof AiAddressRefused)
    )
      return refusedAi("refused");

    if (
      NoObjectGeneratedError.isInstance(error) ||
      JSONParseError.isInstance(error) ||
      TypeValidationError.isInstance(error)
    )
      return refusedAi("no-json");

    return APICallError.isInstance(error) ? apiRefusal(error.statusCode) : refusedAi("unreachable");
  }
}
