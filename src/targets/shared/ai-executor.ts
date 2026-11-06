import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, Output, APICallError, NoObjectGeneratedError } from "ai";

import { type AiExecution, type AiTaskRequest, refusedAi } from "../../core/ai-contract.ts";
import { AiAddressRefused } from "../../core/ai-url.ts";
import type { AiNetwork } from "../../core/ports.ts";
import { AI_CALL_OPTIONS } from "./ai-call-options.ts";

function apiRefusal(status: number | undefined) {
  switch (status) {
    case 401:
    case 403:
      return refusedAi("wrong-key", status);
    case 404:
      return refusedAi("model-not-found", status);
    case undefined: {
      throw new Error("Not implemented yet: undefined case");
    }

    default:
      return refusedAi("unreachable", status ?? null);
  }
}

export async function runHttp<Result>(
  network: AiNetwork,
  task: AiTaskRequest<Result>,
  signal: AbortSignal,
): Promise<AiExecution<Result>> {
  const provider = createOpenAICompatible({
    name: task.config.provider,
    baseURL: task.config.baseUrl,
    apiKey: task.config.key,
    supportsStructuredOutputs: true,
    fetch: network.fetch,
  });

  try {
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

    if (NoObjectGeneratedError.isInstance(error)) return refusedAi("no-json");

    return APICallError.isInstance(error) ? apiRefusal(error.statusCode) : refusedAi("unreachable");
  }
}
