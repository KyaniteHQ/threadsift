import {
  ItemListResponseSchema,
  SavedItemResponseSchema,
  type Item,
} from "../../src/http/schemas.ts";

export type SaveOutcome = "saved" | "refused";

export type SaveResult =
  | { readonly outcome: "refused" }
  | { readonly outcome: "created" | "known"; readonly item: Item };

export async function fetchItems(): Promise<Item[]> {
  const response = await fetch("/api/items");

  if (!response.ok) {
    throw new Error(`GET /api/items answered ${response.status}`);
  }

  return ItemListResponseSchema.parse(await response.json()).items;
}

export async function saveLink(url: string): Promise<SaveResult> {
  const response = await fetch("/api/items", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (response.status === 400) {
    return { outcome: "refused" };
  }

  if (!response.ok) {
    throw new Error(`POST /api/items answered ${response.status}`);
  }

  const { item } = SavedItemResponseSchema.parse(await response.json());

  return { outcome: response.status === 201 ? "created" : "known", item };
}
