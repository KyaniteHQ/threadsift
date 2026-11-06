import { eq } from "drizzle-orm";
import type { z } from "zod";

import {
  type VerifyResultSchema,
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

const TASKS = { digest: { instructions: DIGEST_INSTRUCTIONS, schema: DigestSchema } } as const;

export function verifyAi(
  ports: Ports,
  attempt: AbortSignal,
): Promise<z.infer<typeof VerifyResultSchema>> {
  return runAiTask(ports, "digest", VERIFY_INPUT, attempt);
}

export async function runAiTask(
  ports: Ports,
  kind: keyof typeof TASKS,
  input: string,
  attempt: AbortSignal,
): Promise<z.infer<typeof VerifyResultSchema>> {
  const loaded = await loadAiConfig(ports);

  if (loaded.state !== "ready") return refusedAi(loaded.state);

  if (!ports.ai.allows(loaded.config.baseUrl)) return refusedAi("refused");
  const text = cutDigestInput(input);
  const task = await startTask(ports, kind, text, Date.now() + AI_DEADLINE_MS);
  const signal = AbortSignal.any([attempt, AbortSignal.timeout(AI_DEADLINE_MS)]);

  const result = await ports.executor.run(
    { config: loaded.config, input: text, ...TASKS[kind] },
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

  return result.kind === "done" ? { kind: "done", digest: result.result, taskId: task.id } : result;
}

async function startTask(ports: Ports, kind: keyof typeof TASKS, input: string, deadline: number) {
  const [task] = await ports.db
    .insert(aiTasks)
    .values({
      kind,
      inputs: input,
      inputRevision: 1,
      executor: ports.executor.name,
      attempts: 1,
      deadline,
      state: "running",
    })
    .returning({ id: aiTasks.id });

  if (task === undefined) throw new Error("AI task was not created");

  return task;
}
