import { sql } from "drizzle-orm";

import { mirrorVault } from "../../features/vault/core/vault-mirror.ts";
import { claimingRun } from "../../features/wiki/core/scheduled-claim.ts";
import { bestEffort } from "../kernel/failure-log.ts";
import type { JobPorts } from "../kernel/job-outcome.ts";
import { sweep } from "./sweep.ts";

const SWEEP_TASK = "sweep";

const TICK_SPACING_MS = 30_000;

export async function tick(ports: JobPorts): Promise<void> {
  const claimed = await claimingRun(ports.db, SWEEP_TASK, Date.now(), TICK_SPACING_MS, sql`true`);

  if (claimed.length > 0) {
    await bestEffort({ event: "sweep-failed", fields: {} }, () => sweep(ports));
    await bestEffort({ event: "vault-tick-failed", fields: {} }, () => mirrorVault(ports));
  }
}
