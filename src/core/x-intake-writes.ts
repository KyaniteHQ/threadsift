import { and, eq, ne, sql } from "drizzle-orm";

import { completedAiTask, failedAiTask } from "./ai-tasks.ts";
import { type BotTaskRow, acceptsAnswer } from "./bot-task-states.ts";
import { statusColumns } from "./item-status.ts";
import { closeItemJobs } from "./job-close.ts";
import type { JobPorts, JobWrites } from "./job-outcome.ts";
import { enqueueQuietly } from "./job-rows.ts";
import { aiTasks, items, jobs } from "./schema.ts";
import { queuedVerification } from "./x-verify-store.ts";
import type { XThreadValue } from "./x-wire.ts";

export type IntakeTask = Readonly<
  Pick<BotTaskRow, "id" | "callbackHash" | "inputRevision"> & {
    jobId: number;
    itemId: number;
  }
>;

export function intakeLive(task: IntakeTask) {
  return sql`${acceptsAnswer(task)} and exists (select 1 from ${jobs} where ${jobs.id} = ${task.jobId} and ${jobs.state} <> 'done') and exists (select 1 from ${items} where ${items.id} = ${task.itemId} and ${items.generation} = ${task.inputRevision})`;
}

export async function intakeItem(db: JobPorts["db"], task: IntakeTask) {
  const [item] = await db
    .select({
      normalizedUrl: items.normalizedUrl,
      originalUrl: items.originalUrl,
      pendingDigest: items.pendingDigest,
    })
    .from(items)
    .where(eq(items.id, task.itemId));

  return item ?? null;
}

export function answeredIntake(
  db: JobPorts["db"],
  { id }: Readonly<Pick<IntakeTask, "id">>,
  result: Readonly<{ unavailable: boolean }>,
): JobWrites {
  return [
    db
      .update(aiTasks)
      .set({ answeredAt: Date.now() })
      .where(and(eq(aiTasks.id, id), eq(aiTasks.state, "running"))),
    completedAiTask(db, { taskId: id, result }),
  ];
}

export function storedIntake(
  db: JobPorts["db"],
  task: IntakeTask,
  stored: Readonly<{
    address: string;
    thread: Readonly<XThreadValue>;
    digest: string | null;
  }>,
): JobWrites {
  return [
    ...closeItemJobs(db, sql`${task.itemId}`),
    ...queuedVerification(db, { itemId: task.itemId, ...stored }),
    ...answeredIntake(db, task, { unavailable: false }),
  ];
}

export function unavailableIntake(db: JobPorts["db"], task: IntakeTask): JobWrites {
  const { itemId } = task;

  return [
    ...closeItemJobs(db, sql`${itemId}`),
    db
      .update(items)
      .set({ fetch: "status", ...statusColumns({ kind: "settled" }), pendingDigest: null })
      .where(eq(items.id, itemId)),
    ...answeredIntake(db, task, { unavailable: true }),
  ];
}

export async function staleIntake(
  ports: JobPorts,
  { id, jobId }: Readonly<Pick<IntakeTask, "id" | "jobId">>,
): Promise<void> {
  await failedAiTask(ports.db, id, { reason: "stale", status: null });

  const [woken] = await ports.db
    .update(jobs)
    .set({ nextAttemptAt: Date.now() })
    .where(and(eq(jobs.id, jobId), ne(jobs.state, "done")))
    .returning({ id: jobs.id });

  if (woken !== undefined) await enqueueQuietly(ports, [woken.id], 0);
}
