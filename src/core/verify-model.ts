import { BASE_OUTPUT_TOKENS, type ModelAi, VERIFY_INPUT } from "./ai-contract.ts";
import { completedAiTask } from "./ai-task-rows.ts";
import { failTask, runAiTask } from "./ai-tasks.ts";
import { DIGEST_TASK } from "./digest-task.ts";
import type { AiPorts } from "./ports.ts";

export async function verifyAi(ports: AiPorts, ai: ModelAi, attempt: AbortSignal) {
  const result = await runAiTask(
    ports,
    ai,
    DIGEST_TASK,
    { text: VERIFY_INPUT, inputRevision: 1, attempts: 1, maxOutputTokens: BASE_OUTPUT_TOKENS },
    null,
    attempt,
  );

  if (result.kind !== "done")
    return {
      kind: result.kind,
      reason: result.reason,
      status: result.status,
      levels: result.levels,
    };

  const digest = { ...result.result, keptComments: [] };

  try {
    await completedAiTask(ports.db, { taskId: result.taskId, result: digest });
  } catch {
    return failTask(ports, result.taskId);
  }

  return { kind: result.kind, digest, taskId: result.taskId };
}
