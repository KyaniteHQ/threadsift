import { and, desc, eq, sql } from "drizzle-orm";

import type { Database } from "./database.ts";
import { firstDigest, firstItem, secondDigest, secondItem } from "./disagreement-rows.ts";
import { disagreementInTopic } from "./disagreement-sql.ts";
import { pins } from "./schema.ts";

export const DISAGREEMENTS_SHOWN = 20;

interface Cursor {
  readonly at: number;
  readonly id: number;
}

export async function disagreementPage(
  db: Database,
  topicId: number,
  { cursor, limit }: Readonly<{ cursor: Cursor | null; limit: number }>,
) {
  const rows = await db
    .select({
      id: pins.id,
      at: pins.createdAt,
      reason: pins.fromName,
      firstId: firstItem.id,
      firstTitle: firstDigest.title,
      secondId: secondItem.id,
      secondTitle: secondDigest.title,
    })
    .from(pins)
    .innerJoin(firstItem, eq(firstItem.id, pins.fromItemId))
    .innerJoin(secondItem, eq(secondItem.id, pins.intoItemId))
    .innerJoin(firstDigest, eq(firstDigest.itemId, firstItem.id))
    .innerJoin(secondDigest, eq(secondDigest.itemId, secondItem.id))
    .where(
      and(
        disagreementInTopic(topicId),
        cursor === null
          ? undefined
          : sql`(${pins.createdAt}, ${pins.id}) < (${cursor.at}, ${cursor.id})`,
      ),
    )
    .orderBy(desc(pins.createdAt), desc(pins.id))
    .limit(limit);

  return rows.map(({ id, at, reason, firstId, firstTitle, secondId, secondTitle }) => ({
    id,
    at,
    reason,
    items: [
      { id: firstId, title: firstTitle },
      { id: secondId, title: secondTitle },
    ] as const,
  }));
}

export async function readDisagreements(db: Database, topicId: number) {
  const rows = await disagreementPage(db, topicId, { cursor: null, limit: DISAGREEMENTS_SHOWN });

  return rows.map(({ id, reason, items: pair }) => ({ id, reason, items: pair }));
}
