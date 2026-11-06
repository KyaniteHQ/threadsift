import { and, eq, sql } from "drizzle-orm";

import { AI_DEADLINE_MS, type Digest, type AiRefused } from "./ai-contract.ts";
import { TASKS, runAiTask } from "./ai-tasks.ts";
import type { JobOutcome } from "./job-outcome.ts";
import type { JobPorts } from "./jobs.ts";
import type { Database } from "./ports.ts";
import { type ItemRow, type JobRow, aiTasks, digests, guards, items, jobs } from "./schema.ts";

function retries(result: Readonly<AiRefused>): boolean {
  if (result.status === 400 || result.status === 422) return false;

  return (
    result.reason === "unreachable" ||
    result.reason === "timeout" ||
    result.reason === "provider-busy" ||
    (result.reason === "no-json" &&
      (result.status === null || (result.status >= 200 && result.status < 300)))
  );
}

export async function attemptDigest(ports: JobPorts, job: Readonly<JobRow>): Promise<JobOutcome> {
  const [item] = await ports.db.select().from(items).where(eq(items.id, job.itemId));

  const [fetch] = await ports.db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.itemId, job.itemId), eq(jobs.kind, "fetch"), sql`${jobs.state} <> 'done'`));

  if (fetch !== undefined) return { kind: "requeue" };

  if (item === undefined || item.postText === null)
    return {
      kind: "finish",
      writes: [
        ports.db.update(items).set({ digestOutcome: "none" }).where(eq(items.id, job.itemId)),
      ],
    };

  const result = await runAiTask(
    ports,
    TASKS.digest,
    {
      text: JSON.stringify({ title: item.title, source: item.source, postText: item.postText }),
      inputRevision: item.generation,
      attempts: job.attempts + 1,
    },
    AbortSignal.timeout(AI_DEADLINE_MS),
  );

  if (result.kind !== "done") {
    if (retries(result)) throw new Error(`Digest ${result.reason}`);

    return {
      kind: "finish",
      writes: [
        ports.db.update(items).set({ digestOutcome: "failed" }).where(eq(items.id, job.itemId)),
      ],
    };
  }

  return publishing(ports.db, item, result);
}

function publishing(
  db: Database,
  item: Readonly<ItemRow>,
  result: Extract<Awaited<ReturnType<typeof runAiTask<Digest>>>, { kind: "done" }>,
): JobOutcome {
  const stored = {
    itemId: item.id,
    digest: JSON.stringify(result.result),
    taskId: result.taskId,
    provider: result.provider,
    model: result.model,
    generation: item.generation,
    createdAt: Date.now(),
  };

  return {
    kind: "finish",
    revision: { generation: item.generation, taskId: result.taskId },
    writes: [
      db.insert(guards).select(
        db
          .select({ ok: sql<number>`count(*)`.as("ok") })
          .from(items)
          .where(and(eq(items.id, item.id), eq(items.generation, item.generation))),
      ),
      db.insert(digests).values(stored).onConflictDoUpdate({ target: digests.itemId, set: stored }),
      db
        .update(aiTasks)
        .set({ state: "done", result: stored.digest })
        .where(eq(aiTasks.id, result.taskId)),
      db.update(items).set({ digestOutcome: "none" }).where(eq(items.id, item.id)),
    ],
  };
}
