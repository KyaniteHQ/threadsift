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
  OverviewRetryResponseSchema,
  type Overview,
  TopicPageSchema,
  type TopicPage,
} from "../../src/core/topic-overview-contract.ts";
import { topicApiPath } from "../../src/core/topic-path.ts";
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
import { callOk, parsedBody, parsedFrom, parsedOrNull, withCursor } from "./calls.ts";
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
  const answer = await parsedOrNull("GET", `/api/items/${id}/status`, ItemResponseSchema, 404);

  return answer === null ? "gone" : answer.item;
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

type KeepResult =
  | { readonly outcome: "kept"; readonly highlight: Highlight }
  | { readonly outcome: "changed" };

export async function keepHighlight(
  id: number,
  request: Readonly<CreateHighlightRequest>,
): Promise<KeepResult> {
  const response = await callOk("POST", `/api/items/${id}/highlights`, {
    json: request,
    tolerates: [404, 409],
  });

  if (response.status === 404 || response.status === 409) return { outcome: "changed" };

  return {
    outcome: "kept",
    highlight: (await parsedBody(response, HighlightResponseSchema)).highlight,
  };
}

export async function dropHighlight(id: number, highlightId: number): Promise<void> {
  await callOk("DELETE", `/api/items/${id}/highlights/${highlightId}`, { tolerates: [404] });
}

export type NoteSaveResult =
  | { readonly outcome: "saved"; readonly note: NoteView }
  | { readonly outcome: "newer"; readonly note: NoteView };

export async function putNote(
  id: number,
  request: Readonly<SaveNoteRequest>,
): Promise<NoteSaveResult> {
  const response = await callOk("PUT", `/api/items/${id}/note`, {
    json: request,
    tolerates: [409],
  });

  return response.status === 409
    ? { outcome: "newer", note: (await parsedBody(response, NoteConflictSchema)).note }
    : { outcome: "saved", note: (await parsedBody(response, NoteResponseSchema)).note };
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

type TopicRead =
  | { readonly outcome: "found"; readonly page: TopicPage }
  | { readonly outcome: "missing" };

export async function fetchTopicPage(key: string, cursor: string | null): Promise<TopicRead> {
  const page = await parsedOrNull(
    "GET",
    withCursor(topicApiPath(key), cursor),
    TopicPageSchema,
    404,
  );

  return page === null ? { outcome: "missing" } : { outcome: "found", page };
}

export async function retryTopicOverview(key: string): Promise<Overview | null> {
  const answer = await parsedOrNull(
    "POST",
    `${topicApiPath(key)}/overview`,
    OverviewRetryResponseSchema,
    409,
  );

  return answer === null ? null : answer.overview;
}

export async function saveLink(url: string): Promise<SaveResult> {
  const response = await callOk("POST", "/api/items", { json: { url }, tolerates: [400, 503] });

  if (response.status === 400) {
    const { fetch: refusal } = await parsedBody(response, ErrorResponseSchema);

    return { outcome: refusal === "refused" ? "private" : "invalid" };
  }

  if (response.status === 503) {
    return { outcome: "updating" };
  }

  const { item } = await parsedBody(response, SavedItemResponseSchema);

  const known = response.status !== 201;

  return { outcome: "saved", known, refreshed: refreshedOf(known, item.fetch), item };
}

export async function removeItem(id: number): Promise<void> {
  await callOk("DELETE", `/api/items/${id}`, { tolerates: [404] });
}

export async function regenerateDigest(id: number): Promise<Item> {
  return (await parsedFrom("POST", `/api/items/${id}/digest`, ItemResponseSchema)).item;
}

export type SaveTarget =
  | { readonly kind: "paste"; readonly url: string }
  | { readonly kind: "digest"; readonly url: string; readonly id: number };
