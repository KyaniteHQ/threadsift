import { type SQL, type SQLWrapper, and, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import type { Database } from "./ports.ts";
import { digests, items, pins } from "./schema.ts";

export const DISAGREEMENTS_SHOWN = 20;

const firstItem = alias(items, "first_item");

const secondItem = alias(items, "second_item");

const firstDigest = alias(digests, "first_digest");

const secondDigest = alias(digests, "second_digest");

export function currentDisagreementPin(): SQL {
  return sql`${pins.kind} = 'items-disagree' and ${pins.fromDigest} = (select ${digests.taskId} from ${digests} where ${digests.itemId} = ${pins.fromItemId}) and ${pins.intoDigest} = (select ${digests.taskId} from ${digests} where ${digests.itemId} = ${pins.intoItemId})`;
}

export function pairPinned(first: Readonly<SQLWrapper>, second: Readonly<SQLWrapper>): SQL {
  return sql`exists (select 1 from ${pins} where ${currentDisagreementPin()} and ${pins.fromItemId} = min(${first}, ${second}) and ${pins.intoItemId} = max(${first}, ${second}))`;
}

export async function readDisagreements(db: Database, topicId: number) {
  const rows = await db
    .select({
      id: pins.id,
      reason: pins.fromName,
      firstId: firstItem.id,
      firstTitle: firstDigest.title,
      secondId: secondItem.id,
      secondTitle: secondDigest.title,
    })
    .from(pins)
    .innerJoin(firstItem, and(eq(firstItem.id, pins.fromItemId), eq(firstItem.topicId, topicId)))
    .innerJoin(secondItem, and(eq(secondItem.id, pins.intoItemId), eq(secondItem.topicId, topicId)))
    .innerJoin(firstDigest, eq(firstDigest.itemId, firstItem.id))
    .innerJoin(secondDigest, eq(secondDigest.itemId, secondItem.id))
    .where(currentDisagreementPin())
    .orderBy(desc(pins.id))
    .limit(DISAGREEMENTS_SHOWN);

  return rows.map(({ id, reason, firstId, firstTitle, secondId, secondTitle }) => ({
    id,
    reason,
    items: [
      { id: firstId, title: firstTitle },
      { id: secondId, title: secondTitle },
    ] as const,
  }));
}
