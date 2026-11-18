import { eq, sql } from "drizzle-orm";

import { LISTED_COLUMNS, type ListedItemRow, selectItems } from "./item-selection.ts";
import type { ReadState } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { items } from "./schema.ts";
import { queueVaultItems } from "./vault-queue.ts";

export async function setReadState(
  db: Database,
  id: number,
  readState: ReadState,
): Promise<ListedItemRow | undefined> {
  const itemId = eq(items.id, id);
  const changed = sql`${itemId} and ${items.readState} <> ${readState}`;
  const [, , [item]] = await db.batch([
    queueVaultItems(db, changed),
    db.update(items).set({ readState }).where(changed),
    selectItems(db, LISTED_COLUMNS).where(itemId),
  ]);

  return item;
}
