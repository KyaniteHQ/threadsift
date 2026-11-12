import { type SQL, and, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { pairPinned } from "./disagreement-pins.ts";
import { WEEKLY_TASK } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { digests, items, proposals } from "./schema.ts";
import { claimedAt } from "./weekly-claim.ts";

export const firstItem = alias(items, "first_item");

export const secondItem = alias(items, "second_item");

export const firstDigest = alias(digests, "first_digest");

export const secondDigest = alias(digests, "second_digest");

function judgedOnStoredDigests(sameTopic: boolean) {
  const together = sameTopic ? sql` and held_second.topic_id = held_first.topic_id` : sql``;

  return sql`exists (select 1 from ${items} as held_first join ${digests} as held_first_digest on held_first_digest.item_id = held_first.id and held_first_digest.task_id = ${proposals.fromDigest} join ${items} as held_second on held_second.id = ${proposals.intoItemId}${together} join ${digests} as held_second_digest on held_second_digest.item_id = held_second.id and held_second_digest.task_id = ${proposals.intoDigest} where held_first.id = ${proposals.fromItemId})`;
}

export function disagreementCurrent(): SQL {
  return judgedOnStoredDigests(true);
}

export function disagreementHolds(): SQL {
  return sql`(${disagreementCurrent()} and not ${pairPinned(proposals.fromItemId, proposals.intoItemId)})`;
}

function staleRows() {
  return and(
    eq(proposals.kind, "items-disagree"),
    eq(proposals.state, "open"),
    sql`(not ${judgedOnStoredDigests(false)} or ${pairPinned(proposals.fromItemId, proposals.intoItemId)})`,
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
