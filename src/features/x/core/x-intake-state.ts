import { sql } from "drizzle-orm";

import { X_INTAKE_TASK } from "../../../core/contract/x-intake-contract.ts";
import type { XReadNote } from "../../../core/contract/x-read-note.ts";
import { TIMED_OUT, UNANSWERED, isRunning } from "../../../core/kernel/ai-task-state.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { aiTasks } from "../../../core/kernel/schema.ts";
import { latestTask } from "../../ai/core/bot-task-rows.ts";

export function botFailureNote(jobId: number) {
  const unanswered = sql`(${UNANSWERED}) or (${TIMED_OUT})`;

  return sql<XReadNote | null>`(select case when ${unanswered} then 'bot-timed-out' else 'bot-failed' end from ${aiTasks} where ${aiTasks.jobId} = ${jobId} and ${aiTasks.kind} = ${X_INTAKE_TASK} order by ${aiTasks.id} desc limit 1)`;
}

export async function hasOpenIntakeTask(db: Database, jobId: number): Promise<boolean> {
  const task = await latestTask(db, jobId);

  return task !== null && task.kind === X_INTAKE_TASK && isRunning(task);
}
