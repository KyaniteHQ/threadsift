import { eq } from "drizzle-orm";
import type { z } from "zod";

import { type VerifyResultSchema, AI_DEADLINE_MS, VERIFY_INPUT } from "./ai-contract.ts";
import { executeDigest, refusedAi } from "./ai-executor.ts";
import { savedAi } from "./ai-settings.ts";
import { allowedAiUrl } from "./ai-url.ts";
import type { Ports } from "./ports.ts";
import { aiTasks } from "./schema.ts";
import { sealedSecrets } from "./sealed-secret.ts";

export async function verifyAi(
  ports: Ports,
  attempt: AbortSignal,
): Promise<z.infer<typeof VerifyResultSchema>> {
  const saved = await savedAi(ports);
  const sealing = await sealedSecrets(ports.secretKey);

  if (sealing === null) {
    return refusedAi("secret-missing");
  }

  if (saved === undefined) {
    return refusedAi("not-configured");
  }

  const key = await sealing.open(saved.sealedKey);

  if (key === null) {
    return refusedAi("secret-missing");
  }

  if (!allowedAiUrl(saved.baseUrl, ports.ai.publicOnly)) {
    return refusedAi("refused");
  }

  const task = await startTask(ports, Date.now() + AI_DEADLINE_MS);

  const signal = AbortSignal.any([attempt, AbortSignal.timeout(AI_DEADLINE_MS)]);
  const result = await executeDigest(ports, saved, key, VERIFY_INPUT, signal);

  await ports.db
    .update(aiTasks)
    .set(
      result.kind === "done"
        ? { state: "done", result: JSON.stringify(result.digest) }
        : { state: "failed", refusal: result.reason, status: result.status },
    )
    .where(eq(aiTasks.id, task.id));

  return result.kind === "done" ? { ...result, taskId: task.id } : result;
}

async function startTask(ports: Ports, deadline: number) {
  const [task] = await ports.db
    .insert(aiTasks)
    .values({
      kind: "digest",
      inputs: VERIFY_INPUT,
      inputRevision: 1,
      executor: "http",
      attempts: 1,
      deadline,
      state: "running",
    })
    .returning({ id: aiTasks.id });

  if (task === undefined) {
    throw new Error("AI task was not created");
  }

  return task;
}
