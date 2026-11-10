import { setTimeout as sleep } from "node:timers/promises";

import { type APIRequestContext, type APIResponse, expect, test } from "@playwright/test";
import { z } from "zod";

import type { Digest } from "../src/core/ai-contract.ts";
import {
  ItemListResponseSchema,
  ItemDetailResponseSchema,
  SaveRefusalSchema,
  SavedItemResponseSchema,
} from "../src/http/schemas.ts";
import { waitForRedditTurnIfNeeded } from "./reddit.ts";

const SETTLE_TIMEOUT_MS = 60_000;
const SETTLE_POLL_MS = 250;

export async function postLinkRaw(
  request: APIRequestContext,
  url: string,
  digest?: Readonly<Digest>,
  headers: Readonly<Record<string, string>> = {},
) {
  await waitForRedditTurnIfNeeded(url);
  const response = await request.post("/api/items", { data: { url, digest }, headers });

  return { status: response.status(), body: SavedItemResponseSchema.parse(await response.json()) };
}

export async function refusalOf(response: Readonly<APIResponse>) {
  return SaveRefusalSchema.parse(await response.json());
}

export async function errorOf(response: Readonly<APIResponse>): Promise<string> {
  return (await refusalOf(response)).error;
}

export async function getItem(request: APIRequestContext, id: number) {
  const response = await request.get(`/api/items/${id}`);

  return { status: response.status(), response };
}

export async function itemOf(request: APIRequestContext, id: number) {
  const { status, response } = await getItem(request, id);

  if (status !== 200) {
    throw new Error(`GET /api/items/${id} answered ${status}`);
  }

  return ItemDetailResponseSchema.parse(await response.json()).item;
}

export async function settled(request: APIRequestContext, id: number, timeout = SETTLE_TIMEOUT_MS) {
  await expect
    .poll(async () => (await itemOf(request, id)).status, {
      timeout,
      intervals: [SETTLE_POLL_MS],
    })
    .not.toBe("processing");

  return itemOf(request, id);
}

export async function postLink(request: APIRequestContext, url: string, timeout?: number) {
  const { status, body } = await postLinkRaw(request, url);

  return { status, body: { ...body, item: await settled(request, body.item.id, timeout) } };
}

const FETCH_ATTEMPTS = 3;

export type Fetch = Awaited<ReturnType<typeof itemOf>>["fetch"];

export async function attempted<Result>(
  attempt: () => Promise<Result>,
  fetchOf: (result: Result) => Fetch,
  {
    retryOn = (fetch) => fetch !== "ok",
    fetches = [],
    pauseMs = 0,
  }: Readonly<{
    retryOn?: ((fetch: Fetch) => boolean) | undefined;
    fetches?: Fetch[];
    pauseMs?: number;
  }> = {},
) {
  let started = Date.now();
  const first = await attempt();
  let last = first;
  fetches.push(fetchOf(first));

  for (let tries = 1; tries < FETCH_ATTEMPTS && retryOn(fetchOf(last)); tries += 1) {
    if (pauseMs > 0) {
      const pause = pauseMs * tries;
      test.setTimeout(test.info().timeout + pause + (Date.now() - started));
      await sleep(pause);
    }

    started = Date.now();
    last = await attempt();
    fetches.push(fetchOf(last));
  }

  return { first, last, fetches };
}

export async function postLinkFetched(
  request: APIRequestContext,
  url: string,
  { timeout, retryOn }: Readonly<{ timeout?: number; retryOn?: (fetch: Fetch) => boolean }> = {},
) {
  const { first, last, fetches } = await attempted(
    () => postLink(request, url, timeout),
    ({ body }) => body.item.fetch,
    { retryOn },
  );

  return { status: first.status, body: last.body, fetches };
}

export async function listAll(request: APIRequestContext) {
  const response = await request.get("/api/items");

  return ItemListResponseSchema.parse(await response.json()).items;
}

export async function listForRun(request: APIRequestContext, run: string) {
  return (await listAll(request)).filter((item) => item.normalizedUrl.includes(run));
}

export async function refusedWith(request: APIRequestContext, body: string | undefined) {
  const response = await request.post("/api/items", {
    headers: { "content-type": "application/json" },
    data: body,
  });

  const parsed = z.object({ error: z.string().min(1) }).safeParse(await response.json());

  return { status: response.status(), reason: parsed.success ? parsed.data.error : null };
}
