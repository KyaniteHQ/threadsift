import { eq, sql } from "drizzle-orm";

import type { ReadState } from "../contract/item-contract.ts";
import type { Database } from "../kernel/database.ts";
import { items } from "../kernel/schema.ts";
import { STALE } from "../kernel/vault-stale.ts";
import { LISTED_COLUMNS, type ListedItemRow, selectItems } from "./item-selection.ts";

export async function setReadState(
  db: Database,
  id: number,
  readState: ReadState,
): Promise<ListedItemRow | undefined> {
  const itemId = eq(items.id, id);
  const changed = sql`${itemId} and ${items.readState} <> ${readState}`;
  const [, , [item]] = await db.batch([
    ...STALE.itemChanged(db, changed),
    db.update(items).set({ readState }).where(changed),
    selectItems(db, LISTED_COLUMNS).where(itemId),
  ]);

  return item;
}
