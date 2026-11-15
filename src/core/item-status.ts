import { sql } from "drizzle-orm";

import { hasOpenJob } from "./job-rows.ts";
import type { FailureReason, ItemStatus } from "./kinds.ts";
import { items } from "./schema.ts";

export const IS_FAILED = sql`${items.reason} is not null`;

export const NOT_FAILED = sql`${items.reason} is null`;

export const STATUS_VIEW_COLUMNS = {
  status:
    sql<ItemStatus>`case when ${IS_FAILED} then 'failed' when exists ${hasOpenJob()} then 'processing' else 'ready' end`.as(
      "status",
    ),
  reason: sql<FailureReason | null>`${items.reason}`.as("reason"),
};
