import { type APIRequestContext, type APIResponse, expect } from "@playwright/test";
import { z } from "zod";

import {
  type Highlight,
  HighlightSchema,
  type HighlightSelector,
  type HighlightTarget,
} from "../src/core/highlight-contract.ts";
import { SAME_ORIGIN } from "./access.ts";
import { itemOf } from "./api.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { post, postUrl } from "./thread-fixtures.ts";
import { savedThread, threadJson } from "./threads.ts";

export const CONTEXT_CODE_POINTS = 32;

export type Selector = HighlightSelector;

export type Target = HighlightTarget;

export const POST: Target = { kind: "post" };

export function selectorOf(projection: string, quote: string, occurrence = 0): Selector {
  let at = -1;

  for (let seen = 0; seen <= occurrence; seen += 1) at = projection.indexOf(quote, at + 1);

  expect(
    at,
    `occurrence ${occurrence} of ${JSON.stringify(quote)} in the projection`,
  ).toBeGreaterThanOrEqual(0);

  const before = Array.from(projection.slice(0, at));
  const after = Array.from(projection.slice(at + quote.length));

  return {
    exact: quote,
    prefix: before.slice(-CONTEXT_CODE_POINTS).join(""),
    suffix: after.slice(0, CONTEXT_CODE_POINTS).join(""),
    hint: before.length,
  };
}

const Created = z.object({ highlight: HighlightSchema });

export type HighlightView = Highlight;

export async function createHighlight(
  request: APIRequestContext,
  itemId: number,
  fields: Readonly<{ target: Target; revision: number; selector: Selector }>,
  headers: Readonly<Record<string, string>> = {},
) {
  const response = await request.post(`/api/items/${itemId}/highlights`, { data: fields, headers });

  return { status: response.status(), response };
}

export async function highlightIn(response: APIResponse): Promise<HighlightView> {
  return Created.parse(await response.json()).highlight;
}

export async function created(
  request: APIRequestContext,
  itemId: number,
  fields: Readonly<{ target: Target; revision: number; selector: Selector }>,
): Promise<HighlightView> {
  const { status, response } = await createHighlight(request, itemId, fields);
  expect(status, await response.text()).toBe(201);

  return highlightIn(response);
}

export async function removeHighlight(
  request: APIRequestContext,
  itemId: number,
  highlightId: number,
  headers: Readonly<Record<string, string>> = SAME_ORIGIN,
) {
  return (
    await request.delete(`/api/items/${itemId}/highlights/${highlightId}`, { headers })
  ).status();
}

export async function highlightsOf(request: APIRequestContext, itemId: number) {
  return (await itemOf(request, itemId)).highlights;
}

export async function postRevision(request: APIRequestContext, itemId: number): Promise<number> {
  return (await highlightsOf(request, itemId)).revisions.post;
}

export function statuses(view: Awaited<ReturnType<typeof highlightsOf>>) {
  return view.items.map((highlight) => ({
    id: highlight.id,
    status: highlight.status === "attached" ? "attached" : highlight.reason,
    revision: highlight.revision,
    start: highlight.status === "attached" ? highlight.start : null,
  }));
}

export async function putPost(
  request: APIRequestContext,
  id: string,
  selftext: string,
): Promise<number> {
  const { item } = await savedThread(request, {
    url: postUrl(id),
    content: threadJson(post(id, selftext), []),
  });

  return item.id;
}

const Indexed = z.array(z.object({ id: z.number(), fingerprint: z.string().nullable() }));

export function indexOf(screen: FreshScreen, itemId: number) {
  return screen.fresh.query(
    `SELECT p.id AS id, (SELECT fingerprint FROM search_fingerprints WHERE item_id = ${itemId}) AS fingerprint FROM search_parts p WHERE p.item_id = ${itemId} AND p.kind <> 'highlight' ORDER BY p.id`,
    Indexed,
  );
}

const Parts = z.array(z.object({ highlightId: z.number().nullable(), body: z.string() }));

export function highlightParts(screen: FreshScreen, itemId: number) {
  return screen.fresh.query(
    `SELECT highlight_id AS highlightId, body FROM search_parts WHERE item_id = ${itemId} AND kind = 'highlight' ORDER BY id`,
    Parts,
  );
}
