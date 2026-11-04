import { desc, eq } from "drizzle-orm";

import { parseLink } from "./links.ts";
import type { Database } from "./ports.ts";
import { type ItemRow, items } from "./schema.ts";

export interface SavedItem {
  readonly item: ItemRow;
  readonly created: boolean;
}

export async function saveItem(db: Database, absoluteUrl: string): Promise<SavedItem> {
  const { normalizedUrl, kind, source } = parseLink(absoluteUrl);

  const [inserted] = await db
    .insert(items)
    .values({ source, kind, normalizedUrl, originalUrl: absoluteUrl, savedAt: Date.now() })
    .onConflictDoNothing({ target: items.normalizedUrl })
    .returning();

  if (inserted !== undefined) {
    return { item: inserted, created: true };
  }

  const [existing] = await db.select().from(items).where(eq(items.normalizedUrl, normalizedUrl));

  if (existing === undefined) {
    throw new Error(`Item ${normalizedUrl} was neither inserted nor found`);
  }

  return { item: existing, created: false };
}

export function listItems(db: Database): Promise<ItemRow[]> {
  return db.select().from(items).orderBy(desc(items.savedAt), desc(items.id));
}
