import { type APIRequestContext, expect } from "@playwright/test";

import {
  ItemDetailResponseSchema,
  SavedItemResponseSchema,
} from "../src/core/contract/item-route-wire.ts";
import type { SaveItemInput } from "../src/core/contract/save-wire.ts";

export async function savedItem(
  request: APIRequestContext,
  input: Readonly<SaveItemInput>,
): Promise<number> {
  const saved = await request.post("/api/items", { data: input });

  expect(saved.status(), `the Paste of ${input.url}`).toBe(201);

  return SavedItemResponseSchema.parse(await saved.json()).item.id;
}

export async function itemDetail(request: APIRequestContext, id: number) {
  const read = await request.get(`/api/items/${String(id)}`);

  return ItemDetailResponseSchema.parse(await read.json()).item;
}

export const savedTopicItem = (
  request: APIRequestContext,
  topic: Readonly<{ link: string; name: string; itemTitle: string; summary: string }>,
  markdown: string,
  { tag, keyPoint }: Readonly<{ tag: string; keyPoint: string }>,
): Promise<number> =>
  savedItem(request, {
    url: topic.link,
    page: { markdown, title: topic.itemTitle },
    digest: {
      title: topic.itemTitle,
      topic: topic.name,
      tags: [tag],
      summary: topic.summary,
      keyPoints: [keyPoint],
    },
  });
