import { z } from "zod";

import { type AiExecution, type AiTaskRequest, refusedAi } from "../../core/ai-contract.ts";
import { logFailure } from "../../core/failure-log.ts";

type Json = string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json };

interface BindingRequest {
  readonly messages: readonly Readonly<{ role: "system" | "user"; content: string }>[];
  readonly stream: false;
  readonly max_tokens: number;
  readonly response_format: Readonly<{ type: "json_schema"; json_schema: Json }>;
}

export interface AiBinding {
  readonly run: (
    model: string,
    inputs: BindingRequest,
    options: Readonly<{ signal: AbortSignal }>,
  ) => Promise<Json>;
}

function parsedOrText(text: string) {
  try {
    return z.json().parse(JSON.parse(text));
  } catch {
    return text;
  }
}

const AnswerSchema = z.object({
  response: z.union([z.string().transform(parsedOrText), z.json()]),
});

const UPSTREAM_CODE = /^(?<code>\d{4}): /u;

const REFUSALS = new Map<string, "model-not-found" | "timeout" | "provider-busy">([
  ["5007", "model-not-found"],
  ["3042", "model-not-found"],
  ["3007", "timeout"],
  ["3008", "timeout"],
  ["3040", "provider-busy"],
  ["3036", "provider-busy"],
]);

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- a catch variable is unparsed by construction, and this function reduces it to a refusal.
function refusalOf(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const code = UPSTREAM_CODE.exec(message)?.groups?.["code"] ?? "";
  const refusal = REFUSALS.get(code);

  if (refusal === undefined)
    logFailure("ai-binding-unmapped", { code: code === "" ? "none" : code }, error);

  return refusedAi(refusal ?? "unreachable");
}

async function runBinding<Result>(
  binding: AiBinding,
  task: AiTaskRequest<Result>,
  signal: AbortSignal,
): Promise<AiExecution<Result>> {
  if (task.config.kind !== "binding") return refusedAi("unreachable");

  try {
    const answer = AnswerSchema.safeParse(
      await binding.run(
        task.config.model,
        {
          messages: [
            { role: "system", content: task.instructions },
            { role: "user", content: task.input },
          ],
          stream: false,
          max_tokens: task.maxOutputTokens,
          response_format: {
            type: "json_schema",
            json_schema: z.json().parse(z.toJSONSchema(task.schema)),
          },
        },
        { signal },
      ),
    );

    if (!answer.success) return refusedAi("no-json");
    const result = task.schema.safeParse(answer.data.response);

    return result.success ? { kind: "done", result: result.data } : refusedAi("no-json");
  } catch (error) {
    if (signal.aborted) return refusedAi("timeout");

    return refusalOf(error);
  }
}

export function bindingRunner(binding: AiBinding) {
  return <Result>(task: AiTaskRequest<Result>, signal: AbortSignal) =>
    runBinding(binding, task, signal);
}
