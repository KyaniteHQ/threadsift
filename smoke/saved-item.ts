import { type Page, expect } from "@playwright/test";

import { SavedItemResponseSchema } from "../src/core/contract/item-route-wire.ts";

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
