import type { APIRequestContext } from "@playwright/test";
import { z } from "zod";

import { ItemListResponseSchema, SavedItemResponseSchema } from "../src/http/schemas.ts";
import { waitForRedditTurnIfNeeded } from "./reddit.ts";

export async function postLink(request: APIRequestContext, url: string) {
  await waitForRedditTurnIfNeeded(url);
  const response = await request.post("/api/items", { data: { url } });

  return { status: response.status(), body: SavedItemResponseSchema.parse(await response.json()) };
}

export async function listAll(request: APIRequestContext) {
  const response = await request.get("/api/items");

  return ItemListResponseSchema.parse(await response.json()).items;
}

export async function listForRun(request: APIRequestContext, run: string) {
  return (await listAll(request)).filter((item) => item.normalizedUrl.includes(run));
}

export async function refusedWith(request: APIRequestContext, body: string | undefined) {
  const response = await request.post(
    "/api/items",
    body === undefined ? {} : { headers: { "content-type": "application/json" }, data: body },
  );

  const parsed = z.object({ error: z.string().min(1) }).safeParse(await response.json());

  return { status: response.status(), reason: parsed.success ? parsed.data.error : null };
}
