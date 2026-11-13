import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

import { providerSet } from "./ai-tasks.ts";
import type { WeeklyTask } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { digests, scheduledRuns } from "./schema.ts";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const NEWEST_DIGESTED_ITEM = sql`(select max(${digests.itemId}) from ${digests})`;

export function claimingRun(
  db: Database,
  task: string,
  now: number,
  spacingMs: number,
  when: Readonly<SQLWrapper>,
) {
  return db
    .insert(scheduledRuns)
    .select(
      db
        .select({
          task: sql<string>`${task}`.as("task"),
          lastRunAt: sql<number>`${now}`.as("last_run_at"),
        })
        .from(sql`(select 1) as one`)
        .where(sql`${when}`),
    )
    .onConflictDoUpdate({
      target: scheduledRuns.task,
      set: { lastRunAt: now },
      setWhere: sql`${scheduledRuns.lastRunAt} <= ${now - spacingMs} or ${scheduledRuns.lastRunAt} > ${now + spacingMs}`,
    })
    .returning({ task: scheduledRuns.task });
}

export function claimingWeek(db: Database, now: number, task: WeeklyTask) {
  return claimingRun(
    db,
    task,
    now,
    WEEK_MS,
    sql`${providerSet()} and ${NEWEST_DIGESTED_ITEM} is not null`,
  );
}

export function claimedAt(task: WeeklyTask, now: number): SQL {
  return sql`exists (select 1 from ${scheduledRuns} where ${scheduledRuns.task} = ${task} and ${scheduledRuns.lastRunAt} = ${now})`;
}
