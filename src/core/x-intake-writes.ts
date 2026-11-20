import { and, eq, ne, sql } from "drizzle-orm";

import { completedAiTask, failedAiTask } from "./ai-task-rows.ts";
import { type AiTaskRow, acceptsAnswer } from "./ai-task-state.ts";
import { answeredTask, countedRefusal } from "./bot-task-rows.ts";
import type { Database } from "./database.ts";
import { closeItemJobs } from "./job-close.ts";
import type { JobPorts, JobWrites } from "./job-outcome.ts";
import { enqueueQuietly } from "./job-rows.ts";
import { items, jobs } from "./schema.ts";
import { queuedVerification } from "./x-verify-store.ts";
import type { XThreadValue } from "./x-wire.ts";

export type IntakeTask = Readonly<
  Pick<AiTaskRow, "id" | "callbackHash" | "inputRevision"> & {
    jobId: number;
    itemId: number;
  }
>;

export function intakeLive(task: IntakeTask) {
  return sql`${acceptsAnswer(task)} and exists (select 1 from ${jobs} where ${jobs.id} = ${task.jobId} and ${jobs.state} <> 'done') and exists (select 1 from ${items} where ${items.id} = ${task.itemId} and ${items.generation} = ${task.inputRevision})`;
}

export async function intakeItem(db: Database, task: IntakeTask) {
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

function answeredIntake(
  db: Database,
  { id }: Readonly<Pick<IntakeTask, "id">>,
  result: Readonly<{ unavailable: boolean }>,
): JobWrites {
  return [answeredTask(db, id, Date.now()), completedAiTask(db, { taskId: id, result })];
}

export function storedIntake(
  db: Database,
  task: IntakeTask,
  stored: Readonly<{
    address: string;
    thread: Readonly<XThreadValue>;
    digest: string | null;
  }>,
): JobWrites {
  return [
    ...answeredIntake(db, task, { unavailable: false }),
    ...closeItemJobs(db, sql`${task.itemId}`, { answering: task.id }),
    ...queuedVerification(db, { itemId: task.itemId, ...stored }),
  ];
}

export function unavailableIntake(db: Database, task: IntakeTask): JobWrites {
  const { itemId } = task;

  return [
    ...answeredIntake(db, task, { unavailable: true }),
    ...closeItemJobs(db, sql`${itemId}`, { answering: task.id }),
    db
      .update(items)
      .set({
        fetch: "status",
        xNote: "bot-unavailable",
        reason: null,
        pendingDigest: null,
      })
      .where(eq(items.id, itemId)),
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

export function refusedAnswer(db: Database, task: IntakeTask, now: number) {
  return countedRefusal(db, task, intakeLive(task), now);
}
