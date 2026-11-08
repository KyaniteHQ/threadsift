import { lte } from "drizzle-orm";

import { migrateData } from "./data-steps.ts";
import type { JobPorts } from "./job-outcome.ts";
import { scheduledRuns } from "./schema.ts";
import { sweep } from "./sweep.ts";

const TICK_SPACING_MS = 30_000;

async function claimSweep({ db }: Readonly<JobPorts>, now: number): Promise<boolean> {
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

async function sweepWhenDue(ports: JobPorts): Promise<void> {
  if (await claimSweep(ports, Date.now())) {
    await sweep(ports);
  }
}

export async function tick(ports: JobPorts): Promise<void> {
  const results = await Promise.allSettled([migrateData(ports.db), sweepWhenDue(ports)]);

  for (const result of results) {
    if (result.status === "rejected") {
      throw result.reason;
    }
  }
}
