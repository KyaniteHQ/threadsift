import { and, desc, eq } from "drizzle-orm";

import { currentDisagreementPin } from "./disagreement-pins.ts";
import { firstDigest, firstItem, secondDigest, secondItem } from "./disagreement-rows.ts";
import type { Database } from "./ports.ts";
import { pins } from "./schema.ts";

const DISAGREEMENTS_SHOWN = 20;

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
    .orderBy(desc(pins.createdAt), desc(pins.id))
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
