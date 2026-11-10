import { refreshedOf } from "../../src/core/fetch-results.ts";
import {
  type CreateHighlightRequest,
  type Highlight,
  HighlightResponseSchema,
} from "../../src/core/highlight-contract.ts";
import type { ReadState } from "../../src/core/kinds.ts";
import {
  type NoteView,
  NoteConflictSchema,
  NoteResponseSchema,
  type SaveNoteRequest,
} from "../../src/core/note-contract.ts";
import {
  HighlightsPageResponseSchema,
  type HighlightsPage,
} from "../../src/http/highlights-page-schemas.ts";
import {
  ErrorResponseSchema,
  ItemDetailResponseSchema,
  ItemListResponseSchema,
  ItemPageResponseSchema,
  ItemResponseSchema,
  SavedItemResponseSchema,
  type Item,
  type ItemDetail,
  type ItemList,
  type ItemPage,
} from "../../src/http/schemas.ts";
import { call, parsedFrom, unexpected } from "./calls.ts";
import { type Filters, queryOf } from "./filters.ts";

export type SaveResult =
  | { readonly outcome: "invalid" }
  | { readonly outcome: "private" }
  | { readonly outcome: "updating" }
  | {
      readonly outcome: "saved";
      readonly known: boolean;
      readonly refreshed: boolean;
      readonly item: Item;
    };

export async function fetchItem(id: number): Promise<Item | "gone"> {
  const path = `/api/items/${id}/status`;
  const response = await call("GET", path);

  if (response.status === 404) return "gone";

  if (!response.ok) throw unexpected("GET", path, response.status);

  return ItemResponseSchema.parse(await response.json()).item;
}

export async function fetchItemDetail(id: number): Promise<ItemDetail> {
  return (await parsedFrom("GET", `/api/items/${id}`, ItemDetailResponseSchema)).item;
}

export async function putReadState(id: number, readState: ReadState): Promise<Item> {
  return (
    await parsedFrom("PUT", `/api/items/${id}/read-state`, ItemResponseSchema, {
      json: { readState },
    })
  ).item;
}

export type KeepResult =
  | { readonly outcome: "kept"; readonly highlight: Highlight }
  | { readonly outcome: "changed" };

export async function keepHighlight(
  id: number,
  request: Readonly<CreateHighlightRequest>,
): Promise<KeepResult> {
  const path = `/api/items/${id}/highlights`;
  const response = await call("POST", path, { json: request });

  if (response.status === 404 || response.status === 409) return { outcome: "changed" };

  if (!response.ok) throw unexpected("POST", path, response.status);

  return {
    outcome: "kept",
    highlight: HighlightResponseSchema.parse(await response.json()).highlight,
  };
}

export async function dropHighlight(id: number, highlightId: number): Promise<void> {
  const path = `/api/items/${id}/highlights/${highlightId}`;
  const response = await call("DELETE", path);

  if (!response.ok && response.status !== 404) throw unexpected("DELETE", path, response.status);
}

export type NoteSaveResult =
  | { readonly outcome: "saved"; readonly note: NoteView }
  | { readonly outcome: "newer"; readonly note: NoteView };

export async function putNote(
  id: number,
  request: Readonly<SaveNoteRequest>,
): Promise<NoteSaveResult> {
  const path = `/api/items/${id}/note`;
  const response = await call("PUT", path, { json: request });

  if (response.status === 409) {
    return { outcome: "newer", note: NoteConflictSchema.parse(await response.json()).note };
  }

  if (!response.ok) throw unexpected("PUT", path, response.status);

  return { outcome: "saved", note: NoteResponseSchema.parse(await response.json()).note };
}

export function fetchItems(filters: Readonly<Filters>): Promise<ItemList> {
  return parsedFrom("GET", `/api/items${queryOf(filters)}`, ItemListResponseSchema);
}

export function fetchItemsAfter(filters: Readonly<Filters>, cursor: string): Promise<ItemPage> {
  return parsedFrom("GET", `/api/items${queryOf(filters, cursor)}`, ItemPageResponseSchema);
}

export function fetchHighlightsPage(
  filters: Readonly<Filters>,
  cursor: string | null,
): Promise<HighlightsPage> {
  return parsedFrom(
    "GET",
    `/api/highlights${queryOf(filters, cursor)}`,
    HighlightsPageResponseSchema,
  );
}

export async function saveLink(url: string): Promise<SaveResult> {
  const response = await call("POST", "/api/items", { json: { url } });

  if (response.status === 400) {
    const { fetch: refusal } = ErrorResponseSchema.parse(await response.json());

    return { outcome: refusal === "refused" ? "private" : "invalid" };
  }

  if (response.status === 503) {
    return { outcome: "updating" };
  }

  if (!response.ok) {
    throw unexpected("POST", "/api/items", response.status);
  }

  const { item } = SavedItemResponseSchema.parse(await response.json());

  const known = response.status !== 201;

  return { outcome: "saved", known, refreshed: refreshedOf(known, item.fetch), item };
}

export async function removeItem(id: number): Promise<void> {
  const response = await call("DELETE", `/api/items/${id}`);

  if (!response.ok && response.status !== 404) {
    throw unexpected("DELETE", `/api/items/${id}`, response.status);
  }
}

export async function regenerateDigest(id: number): Promise<Item> {
  return (await parsedFrom("POST", `/api/items/${id}/digest`, ItemResponseSchema)).item;
}

export type SaveTarget =
  | { readonly kind: "paste"; readonly url: string }
  | { readonly kind: "digest"; readonly url: string; readonly id: number };
