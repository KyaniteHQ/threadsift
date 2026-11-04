import type { FetchResult } from "../../src/core/fetch-results.ts";
import {
  ErrorResponseSchema,
  ItemListResponseSchema,
  SavedItemResponseSchema,
  type Item,
} from "../../src/http/schemas.ts";
import type { NoticeKey } from "./text.ts";

export interface SaveOutcome {
  readonly saved: boolean;
  readonly notice: NoticeKey | null;
  readonly focus: "field" | "row";
}

export type SaveResult =
  | { readonly outcome: "invalid" }
  | { readonly outcome: "private" }
  | {
      readonly outcome: "saved";
      readonly known: boolean;
      readonly item: Item;
      readonly fetch: FetchResult;
    };

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
    const { fetch: refusal } = ErrorResponseSchema.parse(await response.json());

    return { outcome: refusal === "refused" ? "private" : "invalid" };
  }

  if (!response.ok) {
    throw new Error(`POST /api/items answered ${response.status}`);
  }

  const { item, fetch: fetched } = SavedItemResponseSchema.parse(await response.json());

  return { outcome: "saved", known: response.status !== 201, item, fetch: fetched };
}
