import { z } from "zod";

import { FilterCountsSchema } from "./filter-counts-contract.ts";
import { READ_STATES } from "./item-contract.ts";
import { ItemDetailSchema } from "./item-detail-wire.ts";
import { type Item, ItemSchema } from "./item-wire.ts";

export const SavedItemResponseSchema = z.object({
  item: ItemSchema,
  url: z.string(),
});

export const ItemResponseSchema = z.object({ item: ItemSchema });

export const ItemDetailResponseSchema = z.object({ item: ItemDetailSchema });

export const ReadStateRequestSchema = z.object({ readState: z.enum(READ_STATES) });

export const ItemPageResponseSchema = z.object({
  items: z.array(ItemSchema),
  next: z.string().nullable(),
});

export const ItemListResponseSchema = ItemPageResponseSchema.extend({ counts: FilterCountsSchema });

export const ItemReadResponseSchema = ItemPageResponseSchema.extend({
  counts: FilterCountsSchema.optional(),
});

export type ItemPage = Readonly<Omit<z.infer<typeof ItemPageResponseSchema>, "items">> & {
  readonly items: readonly Item[];
};

export type ItemList = ItemPage & Readonly<Pick<z.infer<typeof ItemListResponseSchema>, "counts">>;
