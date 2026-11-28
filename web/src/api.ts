import type { ZodType } from "zod";

import { ErrorResponseSchema } from "../../src/core/contract/error-wire.ts";
import { refreshedOf } from "../../src/core/contract/fetch-results.ts";
import {
  HighlightsListResponseSchema,
  HighlightsPageResponseSchema,
} from "../../src/core/contract/highlights-page-wire.ts";
import type { ReadState } from "../../src/core/contract/item-contract.ts";
import type { ItemDetail } from "../../src/core/contract/item-detail-wire.ts";
import {
  ItemDetailResponseSchema,
  ItemListResponseSchema,
  ItemPageResponseSchema,
  ItemResponseSchema,
  SavedItemResponseSchema,
} from "../../src/core/contract/item-route-wire.ts";
import type { Item } from "../../src/core/contract/item-wire.ts";
import {
  OverviewRetryResponseSchema,
  type Overview,
  TopicPageSchema,
  type TopicPage,
} from "../../src/core/contract/topic-overview-contract.ts";
import { topicApiPath } from "../../src/core/contract/topic-path.ts";
import {
  callOk,
  del,
  parsedBody,
  parsedFrom,
  parsedOrGone,
  parsedOrNull,
  post,
  put,
  withCursor,
} from "./calls.ts";
import { type Filters, queryOf } from "./filters.ts";
import { RESTORING, type Restoring, callUnlessRestoring, isRestoring } from "./unavailable.ts";
import { DATABASE_WRITE_DEADLINE_MS, PASTE_DEADLINE_MS } from "./write-deadlines.ts";

export type SaveResult =
  | { readonly kind: "invalid" }
  | { readonly kind: "private" }
  | Restoring
  | {
      readonly kind: "saved";
      readonly known: boolean;
      readonly refreshed: boolean;
      readonly item: Item;
    };

export function fetchItem(id: number): Promise<Item | "gone"> {
  return parsedOrGone(`/api/items/${id}/status`, ItemResponseSchema, ({ item }) => item);
}

export async function fetchItemDetail(id: number): Promise<ItemDetail> {
  return (await parsedFrom("GET", `/api/items/${id}`, ItemDetailResponseSchema)).item;
}

export async function putReadState(id: number, readState: ReadState): Promise<Item> {
  return (
    await parsedFrom(
      put(DATABASE_WRITE_DEADLINE_MS),
      `/api/items/${id}/read-state`,
      ItemResponseSchema,
      {
        json: { readState },
      },
    )
  ).item;
}

function filteredReads<List, Page>(path: string, list: ZodType<List>, page: ZodType<Page>) {
  return {
    first: (filters: Readonly<Filters>, signal: AbortSignal): Promise<List> =>
      parsedFrom("GET", `${path}${queryOf(filters)}`, list, { signal }),
    after: (filters: Readonly<Filters>, cursor: string, signal: AbortSignal): Promise<Page> =>
      parsedFrom("GET", `${path}${queryOf(filters, cursor)}`, page, { signal }),
  };
}

export const { first: fetchItems, after: fetchItemsAfter } = filteredReads(
  "/api/items",
  ItemListResponseSchema,
  ItemPageResponseSchema,
);

export const { first: fetchHighlights, after: fetchHighlightsAfter } = filteredReads(
  "/api/highlights",
  HighlightsListResponseSchema,
  HighlightsPageResponseSchema,
);

export type TopicRead =
  | { readonly outcome: "found"; readonly page: TopicPage }
  | { readonly outcome: "missing" };

export async function fetchTopicPage(
  key: string,
  cursor: string | null,
  signal: AbortSignal,
): Promise<TopicRead> {
  const page = await parsedOrNull(
    "GET",
    withCursor(topicApiPath(key), cursor),
    TopicPageSchema,
    404,
    { signal },
  );

  return page === null ? { outcome: "missing" } : { outcome: "found", page };
}

type OverviewRetry =
  | { readonly kind: "started"; readonly overview: Overview }
  | { readonly kind: "refused" }
  | Restoring;

export async function retryTopicOverview(key: string): Promise<OverviewRetry> {
  const response = await callUnlessRestoring(
    post(DATABASE_WRITE_DEADLINE_MS),
    `${topicApiPath(key)}/overview`,
    { tolerates: [409] },
  );

  if (isRestoring(response)) return RESTORING;

  if (response.status === 409) return { kind: "refused" };

  const { overview } = await parsedBody(response, OverviewRetryResponseSchema);

  return { kind: "started", overview };
}

export async function saveLink(url: string): Promise<SaveResult> {
  const response = await callUnlessRestoring(post(PASTE_DEADLINE_MS), "/api/items", {
    json: { url },
    tolerates: [400],
  });

  if (isRestoring(response)) return RESTORING;

  if (response.status === 400) {
    const { fetch: refusal } = await parsedBody(response, ErrorResponseSchema);

    return { kind: refusal === "refused" ? "private" : "invalid" };
  }

  const { item } = await parsedBody(response, SavedItemResponseSchema);

  const known = response.status !== 201;

  return { kind: "saved", known, refreshed: refreshedOf(known, item.fetch), item };
}

export async function removeItem(id: number): Promise<void> {
  await callOk(del(DATABASE_WRITE_DEADLINE_MS), `/api/items/${id}`, { tolerates: [404] });
}

export async function regenerateDigest(id: number): Promise<SaveResult> {
  const response = await callUnlessRestoring(
    post(DATABASE_WRITE_DEADLINE_MS),
    `/api/items/${id}/digest`,
  );

  if (isRestoring(response)) return RESTORING;

  const { item } = await parsedBody(response, ItemResponseSchema);

  return { kind: "saved", known: true, refreshed: false, item };
}

export type SaveTarget =
  | { readonly kind: "paste"; readonly url: string }
  | { readonly kind: "digest"; readonly url: string; readonly id: number };
