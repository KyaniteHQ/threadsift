import { type Page, expect } from "@playwright/test";

import { ItemDetailResponseSchema, SavedItemResponseSchema } from "../src/http/schemas.ts";
import { RELATED } from "../web/src/reader-text.ts";

interface PastedCase {
  readonly topic: {
    readonly link: string;
    readonly name: string;
    readonly itemTitle: string;
    readonly summary: string;
  };
  readonly markdown: string;
  readonly sentence: string;
}

export async function readerWithoutProvider(
  page: Page,
  { topic, markdown, sentence }: Readonly<PastedCase>,
): Promise<void> {
  const saved = await page.request.post("/api/items", {
    data: {
      url: topic.link,
      page: { markdown, title: topic.itemTitle },
      digest: {
        title: topic.itemTitle,
        topic: topic.name,
        tags: ["backups"],
        summary: topic.summary,
        keyPoints: ["No Provider is saved"],
      },
    },
  });

  expect(saved.status()).toBe(201);

  const { item } = SavedItemResponseSchema.parse(await saved.json());

  await page.goto("/");
  await page
    .locator("article.it")
    .filter({ hasText: topic.itemTitle })
    .getByRole("link")
    .first()
    .click();
  await expect(page.locator(".reader")).toContainText(sentence);
  await expect(page.getByRole("heading", { name: RELATED.title })).toHaveCount(0);

  const detail = await page.request.get(`/api/items/${String(item.id)}`);

  expect(ItemDetailResponseSchema.parse(await detail.json()).item.related).toEqual([]);
}
