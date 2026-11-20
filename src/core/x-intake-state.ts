import { sql } from "drizzle-orm";

import { TIMED_OUT, UNANSWERED, isRunning } from "./ai-task-state.ts";
import { latestTask } from "./bot-task-rows.ts";
import type { Database } from "./database.ts";
import { aiTasks } from "./schema.ts";
import { X_INTAKE_TASK } from "./x-intake-contract.ts";
import type { XReadNote } from "./x-read-note.ts";

export function botFailureNote(jobId: number) {
  const unanswered = sql`(${UNANSWERED}) or (${TIMED_OUT})`;

  return sql<XReadNote | null>`(select case when ${unanswered} then 'bot-timed-out' else 'bot-failed' end from ${aiTasks} where ${aiTasks.jobId} = ${jobId} and ${aiTasks.kind} = ${X_INTAKE_TASK} order by ${aiTasks.id} desc limit 1)`;
}

export async function hasOpenIntakeTask(db: Database, jobId: number): Promise<boolean> {
  const task = await latestTask(db, jobId);

  return task !== null && task.kind === X_INTAKE_TASK && isRunning(task);
}
