import {
  ErrorResponseSchema,
  ItemListResponseSchema,
  ItemResponseSchema,
  SavedItemResponseSchema,
  type Item,
  type ItemList,
} from "../../src/http/schemas.ts";
import { call, parsedFrom, unexpected } from "./calls.ts";
import { type Filters, queryOf } from "./filters.ts";

export type SaveResult =
  | { readonly outcome: "invalid" }
  | { readonly outcome: "private" }
  | {
      readonly outcome: "saved";
      readonly known: boolean;
      readonly refreshed: boolean;
      readonly item: Item;
    };

export async function fetchItem(id: number): Promise<Item> {
  return (await parsedFrom("GET", `/api/items/${id}/status`, ItemResponseSchema)).item;
}

export function fetchItems(filters: Readonly<Filters>): Promise<ItemList> {
  return parsedFrom("GET", `/api/items${queryOf(filters)}`, ItemListResponseSchema);
}

export async function saveLink(url: string): Promise<SaveResult> {
  const response = await call("POST", "/api/items", { json: { url } });

  if (response.status === 400) {
    const { fetch: refusal } = ErrorResponseSchema.parse(await response.json());

    return { outcome: refusal === "refused" ? "private" : "invalid" };
  }

  if (!response.ok) {
    throw unexpected("POST", "/api/items", response.status);
  }

  const { item } = SavedItemResponseSchema.parse(await response.json());

  const known = response.status !== 201;

  return { outcome: "saved", known, refreshed: known && item.fetch !== null, item };
}

export async function regenerateDigest(id: number): Promise<Item> {
  return (await parsedFrom("POST", `/api/items/${id}/digest`, ItemResponseSchema)).item;
}

export type SaveTarget =
  | { readonly kind: "paste"; readonly url: string }
  | { readonly kind: "digest"; readonly url: string; readonly id: number };
