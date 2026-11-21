import { sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { WEEKLY_TASK } from "../../../core/contract/proposal-contract.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { storedTaskIs } from "../../../core/kernel/digest-stored.ts";
import { digests, items, itemsDisagreeProposals } from "../../../core/kernel/schema.ts";
import { pairPinned } from "./disagreement-pins.ts";
import { removedOpen, whereSubject } from "./proposal-lifecycle.ts";
import { claimedAt } from "./scheduled-claim.ts";

export const firstItem = alias(items, "first_item");

export const secondItem = alias(items, "second_item");

export const firstDigest = alias(digests, "first_digest");

export const secondDigest = alias(digests, "second_digest");

function judged(sameTopic: boolean) {
  const together = sameTopic ? sql` and held_second.topic_id = held_first.topic_id` : sql``;

  return sql`exists (select 1 from ${items} as held_first join ${items} as held_second on held_second.id = ${itemsDisagreeProposals.intoItemId}${together} where held_first.id = ${itemsDisagreeProposals.fromItemId} and ${storedTaskIs(itemsDisagreeProposals.fromItemId, itemsDisagreeProposals.fromDigest)} and ${storedTaskIs(itemsDisagreeProposals.intoItemId, itemsDisagreeProposals.intoDigest)})`;
}

const pinned = pairPinned(itemsDisagreeProposals.fromItemId, itemsDisagreeProposals.intoItemId);

export const DISAGREEMENT = {
  accepts: judged(true),
  listed: sql`(${judged(true)} and not ${pinned})`,
  stale: sql`(not ${judged(false)} or ${pinned})`,
} as const;

export function clearedStaleDisagreements(db: Database) {
  return removedOpen(db, "items-disagree", whereSubject("items-disagree", DISAGREEMENT.stale));
}

export function staleDisagreements(db: Database, now: number) {
  return removedOpen(
    db,
    "items-disagree",
    claimedAt(WEEKLY_TASK["items-disagree"], now),
    whereSubject("items-disagree", DISAGREEMENT.stale),
  );
}
