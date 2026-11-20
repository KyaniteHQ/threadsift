import assert from "node:assert/strict";

import { executeClaimed } from "../src/core/compose/jobs.ts";
import { GROK_BOT_EXECUTOR } from "../src/core/kernel/ai-task-state.ts";
import { openJobOfKind } from "./bot-task-fixtures.ts";
import type { sentTopics } from "./disagreement-fixtures.ts";
import type { Instance } from "./instance.ts";
import { exec } from "./related-fixtures.ts";

export async function applyAnswer(
  {
    instance,
    sent,
  }: Readonly<{
    instance: Instance;
    sent: Awaited<ReturnType<typeof sentTopics>>;
  }>,
  taskId: number,
  disagreements: readonly Readonly<{ a: number; b: number; reason: string }>[],
): Promise<void> {
  const owner = sent[0]?.items[0]?.id;

  assert.ok(owner !== undefined);

  const job = await openJobOfKind(instance, { kind: "disagreement_proposals", itemId: owner });

  exec(
    instance,
    "update ai_tasks set context = ?, result = ?, executor = ?, answered_at = ?, job_id = ? where id = ?",
    JSON.stringify(sent),
    JSON.stringify({ disagreements }),
    GROK_BOT_EXECUTOR,
    Date.now(),
    job.id,
    taskId,
  );

  await executeClaimed(instance.core, job);
}
