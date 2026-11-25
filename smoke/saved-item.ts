import { type APIRequestContext, expect } from "@playwright/test";
import type { ZodType } from "zod";

import {
  ItemDetailResponseSchema,
  ItemResponseSchema,
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

async function readItem<Read>(
  request: APIRequestContext,
  path: string,
  schema: ZodType<{ item: Read }>,
): Promise<Read> {
  const read = await request.get(path);

  return schema.parse(await read.json()).item;
}

export function itemDetail(request: APIRequestContext, id: number) {
  return readItem(request, `/api/items/${String(id)}`, ItemDetailResponseSchema);
}

export function itemStatus(request: APIRequestContext, id: number) {
  return readItem(request, `/api/items/${String(id)}/status`, ItemResponseSchema);
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
