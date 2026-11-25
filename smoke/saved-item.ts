import { type APIRequestContext, type Page, expect } from "@playwright/test";

import {
  ItemDetailResponseSchema,
  SavedItemResponseSchema,
} from "../src/core/contract/item-route-wire.ts";

interface SavedDigest {
  readonly title: string;
  readonly topic: string;
  readonly tags: readonly string[];
  readonly summary: string;
  readonly keyPoints: readonly string[];
  readonly keptComments?: readonly string[];
}

type SavedContent =
  | { readonly page: Readonly<{ markdown: string; title: string; author?: string }> }
  | { readonly content: string };

export async function savedItem(
  page: Page,
  { url, digest, ...content }: Readonly<{ url: string; digest?: SavedDigest } & SavedContent>,
): Promise<number> {
  const saved = await page.request.post("/api/items", { data: { url, ...content, digest } });

  expect(saved.status()).toBe(201);

  return SavedItemResponseSchema.parse(await saved.json()).item.id;
}

export async function itemDetail(request: APIRequestContext, id: number) {
  const read = await request.get(`/api/items/${String(id)}`);

  return ItemDetailResponseSchema.parse(await read.json()).item;
}

export const savedTopicItem = (
  page: Page,
  topic: Readonly<{ link: string; name: string; itemTitle: string; summary: string }>,
  markdown: string,
  { tag, keyPoint }: Readonly<{ tag: string; keyPoint: string }>,
): Promise<number> =>
  savedItem(page, {
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
