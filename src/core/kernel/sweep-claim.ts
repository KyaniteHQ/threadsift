import { sql } from "drizzle-orm";

import { scheduledRuns } from "./schema.ts";

export const SWEEP_TASK = "sweep";

export const SWEEP_CLAIMED_AT = sql<number>`coalesce((select ${scheduledRuns.lastRunAt} from ${scheduledRuns} where ${scheduledRuns.task} = ${SWEEP_TASK}), 0)`;
