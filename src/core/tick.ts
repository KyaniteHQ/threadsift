import { sql } from "drizzle-orm";

import type { JobPorts } from "./job-outcome.ts";
import { claimingRun } from "./scheduled-claim.ts";
import { sweep } from "./sweep.ts";

const SWEEP_TASK = "sweep";

const TICK_SPACING_MS = 30_000;

export async function tick(ports: JobPorts): Promise<void> {
  const claimed = await claimingRun(ports.db, SWEEP_TASK, Date.now(), TICK_SPACING_MS, sql`true`);

  if (claimed.length > 0) await sweep(ports);
}
