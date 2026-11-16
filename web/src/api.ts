import { refreshedOf } from "../../src/core/fetch-results.ts";
import type { ReadState } from "../../src/core/kinds.ts";
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
import { unavailableKind } from "./unavailable.ts";
import { DATABASE_WRITE_DEADLINE_MS, PASTE_DEADLINE_MS } from "./write-deadlines.ts";

export type SaveResult =
  | { readonly outcome: "invalid" }
  | { readonly outcome: "private" }
  | { readonly outcome: "updating" | "restoring" }
  | {
      readonly outcome: "saved";
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
    post(DATABASE_WRITE_DEADLINE_MS),
    `${topicApiPath(key)}/overview`,
    OverviewRetryResponseSchema,
    409,
  );

  return answer === null ? null : answer.overview;
}

export async function saveLink(url: string): Promise<SaveResult> {
  const response = await callOk(post(PASTE_DEADLINE_MS), "/api/items", {
    json: { url },
    tolerates: [400, 503],
  });

  if (response.status === 400) {
    const { fetch: refusal } = await parsedBody(response, ErrorResponseSchema);

    return { outcome: refusal === "refused" ? "private" : "invalid" };
  }

  if (response.status === 503) {
    return { outcome: await unavailableKind(response) };
  }

  const { item } = await parsedBody(response, SavedItemResponseSchema);

  const known = response.status !== 201;

  return { outcome: "saved", known, refreshed: refreshedOf(known, item.fetch), item };
}

export async function removeItem(id: number): Promise<void> {
  await callOk(del(DATABASE_WRITE_DEADLINE_MS), `/api/items/${id}`, { tolerates: [404] });
}

export async function regenerateDigest(id: number): Promise<Item> {
  return (
    await parsedFrom(
      post(DATABASE_WRITE_DEADLINE_MS),
      `/api/items/${id}/digest`,
      ItemResponseSchema,
    )
  ).item;
}

export type SaveTarget =
  | { readonly kind: "paste"; readonly url: string }
  | { readonly kind: "digest"; readonly url: string; readonly id: number };
