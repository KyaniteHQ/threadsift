import { eq } from "drizzle-orm";

import { LISTED_COLUMNS, type ListedItemRow, selectItems } from "./item-selection.ts";
import type { ReadState } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { items } from "./schema.ts";

export async function setReadState(
  db: Database,
  id: number,
  readState: ReadState,
): Promise<ListedItemRow | undefined> {
  const [, [item]] = await db.batch([
    db.update(items).set({ readState }).where(eq(items.id, id)),
    selectItems(db, LISTED_COLUMNS).where(eq(items.id, id)),
  ]);

  return item;
}
