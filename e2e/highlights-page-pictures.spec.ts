import { type Page, expect, test } from "@playwright/test";

import { PICTURE_LABEL } from "../web/src/reader-text.ts";
import { type ArticleScreen, openArticleScreen } from "./article-screen.ts";
import { collapsed, emptyAltPicture, keepAround, openArticleBody } from "./highlight-pictures.ts";
import { entries, openPage } from "./highlights-page-ui.ts";
import { DESKTOP, attachScreenshot } from "./look.ts";

test.describe.configure({ timeout: 600_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

const OBJECT_REPLACEMENT = "\uFFFC";

let library: ArticleScreen;

test.beforeAll(async ({ browser }) => {
  library = await openArticleScreen(browser);
});

test.afterAll(async () => {
  await library.screen.close();
});

async function expectPlaceholders(
  page: Page,
  width: number,
  kept: Readonly<{ id: number; exact: string }>,
  pictures: number,
): Promise<void> {
  await openPage(page, width);

  const link = page.locator(`a.hp-open[href="/items/${library.articleId}?highlight=${kept.id}"]`);
  const quote = entries(page).filter({ has: link }).locator("blockquote.hp-text");

  await expect(quote).toBeVisible();

  const text = (await quote.textContent()) ?? "";

  await attachScreenshot(page, test.info(), `entry-${width}`);

  expect(text, `at ${width}px the raw character is not drawn`).not.toContain(OBJECT_REPLACEMENT);
  expect(collapsed(text), `at ${width}px the words around the picture are all there`).toBe(
    collapsed(kept.exact.replaceAll(OBJECT_REPLACEMENT, "")),
  );

  const placeholders = quote.getByRole("img", { name: PICTURE_LABEL, exact: true });

  await expect(placeholders).toHaveCount(pictures);
  await expect(placeholders.first()).toBeVisible();

  const box = await placeholders.first().boundingBox();
  const quoteBox = await quote.boundingBox();

  expect(box?.width ?? 0, "the placeholder takes room in the line").toBeGreaterThan(8);
  expect(box?.height ?? 0).toBeGreaterThan(8);
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(quoteBox?.x ?? 0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
    (quoteBox?.x ?? 0) + (quoteBox?.width ?? 0) + 1,
  );

  await expect(link).toHaveAccessibleDescription(new RegExp(`\\b${PICTURE_LABEL}\\b`, "u"));
}

test("a Highlight kept across a stored picture with empty alt text shows an image placeholder inside its quote on the Highlights page, named for assistive technology, and not the raw character", async () => {
  const { page } = library.screen;
  const index = await emptyAltPicture(await openArticleBody(library));

  expect(index, "the Article has a stored picture with empty alt text").toBeGreaterThanOrEqual(0);

  const kept = await keepAround(library, index);
  const pictures = kept.exact.split(OBJECT_REPLACEMENT).length - 1;

  expect(pictures, "the kept text holds the picture as one character").toBeGreaterThan(0);

  await expectPlaceholders(page, DESKTOP.width, kept, pictures);
  await expectPlaceholders(page, 390, kept, pictures);
});
