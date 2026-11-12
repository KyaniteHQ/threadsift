import { and, eq, sql } from "drizzle-orm";

import { WEEKLY_TASK } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { digests, items, proposals } from "./schema.ts";
import { claimedAt } from "./weekly-claim.ts";

function judgedOnStoredDigests(sameTopic: boolean) {
  const together = sameTopic ? sql` and held_second.topic_id = held_first.topic_id` : sql``;

  return sql`exists (select 1 from ${items} as held_first join ${digests} as held_first_digest on held_first_digest.item_id = held_first.id and held_first_digest.task_id = ${proposals.fromDigest} join ${items} as held_second on held_second.id = ${proposals.intoItemId}${together} join ${digests} as held_second_digest on held_second_digest.item_id = held_second.id and held_second_digest.task_id = ${proposals.intoDigest} where held_first.id = ${proposals.fromItemId})`;
}

export function disagreementHolds() {
  return judgedOnStoredDigests(true);
}

function staleRows() {
  return and(
    eq(proposals.kind, "items-disagree"),
    eq(proposals.state, "open"),
    sql`not ${judgedOnStoredDigests(false)}`,
  );
}

export function clearedStaleDisagreements(db: Database) {
  return db.delete(proposals).where(staleRows());
}

export function staleDisagreements(db: Database, now: number) {
  return db
    .delete(proposals)
    .where(and(claimedAt(WEEKLY_TASK["items-disagree"], now), staleRows()));
}
