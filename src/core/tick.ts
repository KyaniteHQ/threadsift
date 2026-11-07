import { lte } from "drizzle-orm";

import { sweepDigests } from "./digest-job.ts";
import { cleanFiles } from "./file-cleanup.ts";
import type { JobPorts } from "./job-outcome.ts";
import { enqueueRows } from "./job-rows.ts";
import { dueIds } from "./jobs.ts";
import type { Database } from "./ports.ts";
import { scheduledRuns } from "./schema.ts";
import { reconcileSearchParts } from "./search-reconciler.ts";

const SWEEP_LIMIT = 100;
const TICK_SPACING_MS = 30_000;

async function sweep(ports: JobPorts): Promise<void> {
  const now = Date.now();
  await sweepDigests(ports.db, now);
  await reconcileSearchParts(ports);
  const due = await dueIds(ports.db, now, SWEEP_LIMIT);

  await enqueueRows(ports, due);
  await cleanFiles(ports);
}

async function claimSweep(db: Database, now: number): Promise<boolean> {
  const claimed = await db
    .insert(scheduledRuns)
    .values({ task: "sweep", lastRunAt: now })
    .onConflictDoUpdate({
      target: scheduledRuns.task,
      set: { lastRunAt: now },
      setWhere: lte(scheduledRuns.lastRunAt, now - TICK_SPACING_MS),
    })
    .returning({ task: scheduledRuns.task });

  return claimed.length > 0;
}

export async function tick(ports: JobPorts): Promise<void> {
  if (await claimSweep(ports.db, Date.now())) {
    await sweep(ports);
  }
}
