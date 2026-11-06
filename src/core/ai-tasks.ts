import { eq } from "drizzle-orm";

import {
  type AiExecution,
  type AiRefused,
  type AiTaskDefinition,
  AI_DEADLINE_MS,
  VERIFY_INPUT,
  DIGEST_INSTRUCTIONS,
  DigestSchema,
  cutDigestInput,
  refusedAi,
} from "./ai-contract.ts";
import { loadAiConfig } from "./ai-settings.ts";
import type { Ports } from "./ports.ts";
import { aiTasks } from "./schema.ts";

const TASKS = {
  digest: {
    kind: "digest",
    instructions: DIGEST_INSTRUCTIONS,
    schema: DigestSchema,
    prepareInput: cutDigestInput,
  },
} as const;

type TaskResult<Result> =
  | (AiExecution<Result> & { readonly taskId: number })
  | (AiRefused & { readonly taskId: null });

export async function verifyAi(ports: Ports, attempt: AbortSignal) {
  const result = await runAiTask(
    ports,
    TASKS.digest,
    { text: VERIFY_INPUT, inputRevision: 1, attempts: 1 },
    attempt,
  );

  return result.kind === "done"
    ? { kind: result.kind, digest: result.result, taskId: result.taskId }
    : { kind: result.kind, reason: result.reason, status: result.status };
}

export async function runAiTask<Result>(
  ports: Ports,
  definition: AiTaskDefinition<Result>,
  input: Readonly<{ text: string; inputRevision: number; attempts: number }>,
  attempt: AbortSignal,
): Promise<TaskResult<Result>> {
  const loaded = await loadAiConfig(ports);

  if (loaded.state !== "ready") return { ...refusedAi(loaded.state), taskId: null };

  if (!ports.ai.allowsUrl(loaded.config.baseUrl)) return { ...refusedAi("refused"), taskId: null };
  const text = definition.prepareInput(input.text);

  const task = await startTask(ports, definition.kind, text, input);

  const signal = AbortSignal.any([attempt, AbortSignal.timeout(AI_DEADLINE_MS)]);

  try {
    const result = await ports.ai.run(
      {
        config: loaded.config,
        input: text,
        instructions: definition.instructions,
        schema: definition.schema,
      },
      signal,
    );

    await ports.db
      .update(aiTasks)
      .set(
        result.kind === "done"
          ? { state: "done", result: JSON.stringify(result.result) }
          : { state: "failed", refusal: result.reason, status: result.status },
      )
      .where(eq(aiTasks.id, task.id));

    return { ...result, taskId: task.id };
  } catch {
    return failTask(ports, task.id);
  }
}

async function failTask(ports: Ports, taskId: number) {
  const failure = { ...refusedAi("unreachable"), taskId };

  try {
    await ports.db
      .update(aiTasks)
      .set({ state: "failed", result: null, refusal: failure.reason, status: failure.status })
      .where(eq(aiTasks.id, taskId));

    return failure;
  } catch {
    return failure;
  }
}

async function startTask(
  ports: Ports,
  kind: string,
  text: string,
  input: Readonly<{ inputRevision: number; attempts: number }>,
) {
  const [task] = await ports.db
    .insert(aiTasks)
    .values({
      kind,
      inputs: text,
      inputRevision: input.inputRevision,
      attempts: input.attempts,
      executor: ports.ai.name,
      deadline: Date.now() + AI_DEADLINE_MS,
      state: "running",
    })
    .returning({ id: aiTasks.id });

  if (task === undefined) throw new Error("AI task was not created");

  return task;
}
