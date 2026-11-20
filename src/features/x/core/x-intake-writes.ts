import { eq, sql } from "drizzle-orm";

import type { XThreadValue } from "../../../core/contract/x-wire.ts";
import { completedAiTask, failedAiTask } from "../../../core/kernel/ai-task-rows.ts";
import { type AiTaskRow, acceptsAnswer } from "../../../core/kernel/ai-task-state.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { closeItemJobs } from "../../../core/kernel/job-close.ts";
import type { JobPorts, JobWrites } from "../../../core/kernel/job-outcome.ts";
import { enqueueQuietly, jobIsOpen } from "../../../core/kernel/job-rows.ts";
import { wokenJob } from "../../../core/kernel/job-waiting.ts";
import { items, jobs } from "../../../core/kernel/schema.ts";
import { answeredTask, countedRefusal } from "../../ai/core/bot-task-rows.ts";
import { withdrawnFetch } from "../../item/core/settle.ts";
import { queuedVerification } from "./x-verify-store.ts";

export type IntakeTask = Readonly<
  Pick<AiTaskRow, "id" | "callbackHash" | "inputRevision"> & {
    jobId: number;
    itemId: number;
  }
>;

export function intakeLive(task: IntakeTask) {
  return sql`${acceptsAnswer(task)} and ${jobIsOpen(task.jobId)} and exists (select 1 from ${items} where ${items.id} = ${task.itemId} and ${items.generation} = ${task.inputRevision})`;
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
    withdrawnFetch(db, itemId, "status", "bot-unavailable"),
  ];
}

export async function staleIntake(
  ports: JobPorts,
  { id, jobId }: Readonly<Pick<IntakeTask, "id" | "jobId">>,
): Promise<void> {
  await failedAiTask(ports.db, id, { reason: "stale", status: null });

  const [woken] = await wokenJob(ports.db, jobId, Date.now()).returning({ id: jobs.id });

  if (woken !== undefined) await enqueueQuietly(ports, [woken.id], 0);
}

export function refusedAnswer(db: Database, task: IntakeTask, now: number) {
  return countedRefusal(db, task, intakeLive(task), now);
}
