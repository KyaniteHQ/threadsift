import { sql } from "drizzle-orm";

import type { WaitReason } from "./kinds.ts";
import { items, jobs } from "./schema.ts";

const WAITING_FETCH = sql`${jobs.itemId} = ${items.id} and ${jobs.kind} = 'fetch' and ${jobs.state} = 'queued' and ${jobs.waitReason} is not null`;

export const WAIT_VIEW_COLUMNS = {
  waitReason:
    sql<WaitReason | null>`(select ${jobs.waitReason} from ${jobs} where ${WAITING_FETCH})`.as(
      "wait_reason",
    ),
  retryAt: sql<
    number | null
  >`(select ${jobs.nextAttemptAt} from ${jobs} where ${WAITING_FETCH})`.as("retry_at"),
};
