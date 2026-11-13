import { asc, eq } from "drizzle-orm";

import { itemTitle } from "./item-title.ts";
import type { Database } from "./ports.ts";
import { digests, items, relatedItems } from "./schema.ts";

export function relatedRows(db: Database, itemId: number) {
  return db
    .select({
      id: items.id,
      title: itemTitle(),
      source: items.source,
      reason: relatedItems.reason,
    })
    .from(relatedItems)
    .innerJoin(items, eq(items.id, relatedItems.relatedId))
    .leftJoin(digests, eq(digests.itemId, items.id))
    .where(eq(relatedItems.itemId, itemId))
    .orderBy(asc(relatedItems.position));
}
