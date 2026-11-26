import type { z } from "zod";

import type { Ports } from "../core/kernel/ports.ts";
import { getItem } from "../features/item/core/item-detail.ts";
import { itemFilters } from "../features/item/core/item-filters.ts";
import { listItems } from "../features/item/core/item-selection.ts";
import { itemView } from "./item-view.ts";
import type { ItemQuerySchema } from "./route-input.ts";

export function withCounts<Shown extends object, Counts>(
  shown: Shown,
  counts: Counts | null,
): Shown | (Shown & { readonly counts: Counts }) {
  return counts === null ? shown : { ...shown, counts };
}

export async function readItemPage(ports: Ports, query: Readonly<z.infer<typeof ItemQuerySchema>>) {
  const { cursor = null, ...typed } = query;

  const { items, next, counts } = await listItems(ports.db, itemFilters(typed), cursor);

  const shown = { items: items.map((row) => itemView(row)), next };

  return withCounts(shown, counts);
}

export async function readItem(ports: Ports, id: number) {
  const item = await getItem(ports, id);

  return item === undefined ? undefined : { item: itemView(item) };
}
