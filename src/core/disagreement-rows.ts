import { eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { pairPinned } from "./disagreement-pins.ts";
import { WEEKLY_TASK } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { removedOpen } from "./proposal-lifecycle.ts";
import { digests, items, proposals } from "./schema.ts";
import { claimedAt } from "./weekly-claim.ts";

export const firstItem = alias(items, "first_item");

export const secondItem = alias(items, "second_item");

export const firstDigest = alias(digests, "first_digest");

export const secondDigest = alias(digests, "second_digest");

function judged(sameTopic: boolean) {
  const together = sameTopic ? sql` and held_second.topic_id = held_first.topic_id` : sql``;

  return sql`exists (select 1 from ${items} as held_first join ${digests} as held_first_digest on held_first_digest.item_id = held_first.id and held_first_digest.task_id = ${proposals.fromDigest} join ${items} as held_second on held_second.id = ${proposals.intoItemId}${together} join ${digests} as held_second_digest on held_second_digest.item_id = held_second.id and held_second_digest.task_id = ${proposals.intoDigest} where held_first.id = ${proposals.fromItemId})`;
}

const pinned = pairPinned(proposals.fromItemId, proposals.intoItemId);

export const DISAGREEMENT = {
  accepts: judged(true),
  listed: sql`(${judged(true)} and not ${pinned})`,
  stale: sql`(not ${judged(false)} or ${pinned})`,
} as const;

export function clearedStaleDisagreements(db: Database) {
  return removedOpen(db, eq(proposals.kind, "items-disagree"), DISAGREEMENT.stale);
}

export function staleDisagreements(db: Database, now: number) {
  return removedOpen(
    db,
    claimedAt(WEEKLY_TASK["items-disagree"], now),
    eq(proposals.kind, "items-disagree"),
    DISAGREEMENT.stale,
  );
}
