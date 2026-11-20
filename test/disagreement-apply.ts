import assert from "node:assert/strict";

import { eq } from "drizzle-orm";

import { GROK_BOT_EXECUTOR } from "../src/core/kernel/ai-task-state.ts";
import { aiTasks } from "../src/core/kernel/schema.ts";
import { BOT_TASK_KINDS } from "../src/features/bot/core/bot-task-kinds.ts";
import { openJobOfKind } from "./bot-task-fixtures.ts";
import type { ReadingDatabase, sentTopics } from "./disagreement-fixtures.ts";
import type { Instance } from "./instance.ts";
import { exec } from "./related-fixtures.ts";

export async function applyAnswer(
  {
    instance,
    db,
    sent,
  }: Readonly<{
    instance: Instance;
    db: ReadingDatabase;
    sent: Awaited<ReturnType<typeof sentTopics>>;
  }>,
  taskId: number,
  disagreements: readonly Readonly<{ a: number; b: number; reason: string }>[],
): Promise<void> {
  exec(
    instance,
    "update ai_tasks set context = ?, result = ?, executor = ?, answered_at = ? where id = ?",
    JSON.stringify(sent),
    JSON.stringify({ disagreements }),
    GROK_BOT_EXECUTOR,
    Date.now(),
    taskId,
  );

  const [task] = await db.select().from(aiTasks).where(eq(aiTasks.id, taskId));
  const owner = sent[0]?.items[0]?.id;

  assert.ok(task !== undefined && owner !== undefined);

  const job = await openJobOfKind(instance, { kind: "disagreement_proposals", itemId: owner });

  const outcome = await BOT_TASK_KINDS.disagreement_proposals.apply(
    { ...instance.core, db },
    job,
    task,
  );

  assert.ok("writes" in outcome);

  const [head, ...rest] = outcome.writes;

  assert.ok(head !== undefined);
  await db.batch([head, ...rest]);
}
