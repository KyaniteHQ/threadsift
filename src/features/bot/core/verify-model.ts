import {
  BASE_OUTPUT_TOKENS,
  type ModelAi,
  VERIFY_INPUT,
  refusedAi,
} from "../../../core/contract/ai-contract.ts";
import type { Digest } from "../../../core/contract/digest-schema.ts";
import { completedAiTask } from "../../../core/kernel/ai-task-rows.ts";
import { aiTasks } from "../../../core/kernel/ai-task-tables.ts";
import { logFailure } from "../../../core/kernel/failure-log.ts";
import type { AiPorts } from "../../../core/kernel/ports.ts";
import { failTask, runAiTask } from "../../ai/core/ai-tasks.ts";
import { DIGEST_TASK } from "../../digest/core/digest-task.ts";

async function completedVerify(
  ports: AiPorts,
  task: Readonly<{ taskId: number; result: Digest }>,
): Promise<boolean | null> {
  try {
    const rows = await completedAiTask(ports.db, task).returning({ id: aiTasks.id });

    return rows.length > 0;
  } catch (error) {
    logFailure("verify-completion-failed", { taskId: task.taskId }, error);

    return null;
  }
}

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

  const completed = await completedVerify(ports, { taskId: result.taskId, result: digest });

  if (completed === null) return failTask(ports, result.taskId);

  if (!completed) return { ...refusedAi("timeout"), taskId: result.taskId };

  return { kind: result.kind, digest, taskId: result.taskId };
}
