import { sql } from "drizzle-orm";

import { migrateData } from "./data-steps.ts";
import type { JobPorts } from "./job-outcome.ts";
import { claimingRun } from "./scheduled-claim.ts";
import { sweep } from "./sweep.ts";

const SWEEP_TASK = "sweep";

const TICK_SPACING_MS = 30_000;

async function claimSweep({ db }: Readonly<JobPorts>, now: number): Promise<boolean> {
  const claimed = await claimingRun(db, SWEEP_TASK, now, TICK_SPACING_MS, sql`true`);

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
