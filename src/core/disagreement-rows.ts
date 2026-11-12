import { and, eq, sql } from "drizzle-orm";

import { WEEKLY_TASK } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { digests, items, proposals, scheduledRuns } from "./schema.ts";

export function disagreementHolds() {
  return sql`exists (select 1 from ${items} as first_item join ${digests} as first_digest on first_digest.item_id = first_item.id and first_digest.task_id = ${proposals.fromDigest} join ${items} as second_item on second_item.topic_id = first_item.topic_id and second_item.id = ${proposals.intoItemId} join ${digests} as second_digest on second_digest.item_id = second_item.id and second_digest.task_id = ${proposals.intoDigest} where first_item.id = ${proposals.fromItemId})`;
}

export function staleDisagreements(db: Database, now: number) {
  return db
    .delete(proposals)
    .where(
      and(
        sql`exists (select 1 from ${scheduledRuns} where ${scheduledRuns.task} = ${WEEKLY_TASK["items-disagree"]} and ${scheduledRuns.lastRunAt} = ${now})`,
        eq(proposals.kind, "items-disagree"),
        eq(proposals.state, "open"),
        sql`not ${disagreementHolds()}`,
      ),
    );
}
