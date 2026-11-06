import {
  ErrorResponseSchema,
  ItemListResponseSchema,
  ItemResponseSchema,
  SavedItemResponseSchema,
  type Item,
} from "../../src/http/schemas.ts";
import { call, parsedFrom, unexpected } from "./calls.ts";

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
  return (await parsedFrom("GET", `/api/items/${id}`, ItemResponseSchema)).item;
}

export async function fetchItems(): Promise<Item[]> {
  return (await parsedFrom("GET", "/api/items", ItemListResponseSchema)).items;
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
