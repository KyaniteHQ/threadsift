import type { z } from "zod";

import { getItem } from "../core/item-detail.ts";
import { itemFilters } from "../core/item-filters.ts";
import { listItems } from "../core/item-selection.ts";
import type { Ports } from "../core/ports.ts";
import { itemView, shownItems } from "./item-view.ts";
import type { ItemQuerySchema } from "./schemas.ts";

export async function readItemPage(ports: Ports, query: Readonly<z.infer<typeof ItemQuerySchema>>) {
  const { cursor = null, ...typed } = query;

  const { items, next, counts } = await listItems(ports.db, itemFilters(typed), cursor);

  const shown = { items: shownItems(items), next };

  return counts === null ? shown : { ...shown, counts };
}

export async function readItem(ports: Ports, id: number) {
  const item = await getItem(ports, id);

  return item === undefined ? undefined : { item: itemView(item) };
}
