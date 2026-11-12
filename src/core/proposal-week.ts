import { sql } from "drizzle-orm";

import { providerSet } from "./ai-tasks.ts";
import type { JobPorts } from "./job-outcome.ts";
import { enqueueRows, opening } from "./job-rows.ts";
import { type MergeKind, WEEKLY_TASK } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { digests, items, scheduledRuns } from "./schema.ts";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const NEWEST_DIGESTED_ITEM = sql`(select max(${digests.itemId}) from ${digests})`;

function claimingWeek(db: Database, now: number, task: (typeof WEEKLY_TASK)[MergeKind]) {
  return db
    .insert(scheduledRuns)
    .select(
      db
        .select({
          task: sql<string>`${task}`.as("task"),
          lastRunAt: sql<number>`${now}`.as("last_run_at"),
        })
        .from(sql`(select 1) as one`)
        .where(sql`${providerSet()} and ${NEWEST_DIGESTED_ITEM} is not null`),
    )
    .onConflictDoUpdate({
      target: scheduledRuns.task,
      set: { lastRunAt: now },
      setWhere: sql`${scheduledRuns.lastRunAt} <= ${now - WEEK_MS} or ${scheduledRuns.lastRunAt} > ${now + WEEK_MS}`,
    })
    .returning({ task: scheduledRuns.task });
}

export async function openWeeklyRun(ports: JobPorts, now: number, kind: MergeKind) {
  const { db } = ports;
  const task = WEEKLY_TASK[kind];

  const [, opened] = await db.batch([
    claimingWeek(db, now, task),
    opening(db, {
      kind: task,
      address: sql`${items.originalUrl}`,
      now,
      where: sql`${items.id} = ${NEWEST_DIGESTED_ITEM} and changes() > 0`,
    }),
  ]);

  await enqueueRows(ports, opened);
}
