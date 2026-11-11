import { asc, eq, sql } from "drizzle-orm";

import type { Database } from "./ports.ts";
import { digests, items, relatedItems } from "./schema.ts";

export function relatedRows(db: Database, itemId: number) {
  return db
    .select({
      id: items.id,
      title: sql<string | null>`coalesce(${digests.title}, ${items.title})`,
      source: items.source,
      reason: relatedItems.reason,
    })
    .from(relatedItems)
    .innerJoin(items, eq(items.id, relatedItems.relatedId))
    .leftJoin(digests, eq(digests.itemId, items.id))
    .where(eq(relatedItems.itemId, itemId))
    .orderBy(asc(relatedItems.position));
}
