import { expect, test } from "@playwright/test";

import { PICTURE_LABEL } from "../web/src/reader-text.ts";
import { type ArticleScreen, openArticleScreen } from "./article-screen.ts";
import { collapsed, emptyAltPicture, keepAround, openArticleBody } from "./highlight-pictures.ts";
import { listEntries } from "./highlight-reader.ts";
import { attachScreenshot } from "./look.ts";

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

test("a Highlight kept across a stored picture with empty alt text shows an image placeholder inside its quote in the Reader's list, named for assistive technology, and not the raw character", async () => {
  const { page } = library.screen;
  const index = await emptyAltPicture(await openArticleBody(library));

  expect(index, "the Article has a stored picture with empty alt text").toBeGreaterThanOrEqual(0);

  const kept = await keepAround(library, index);
  const pictures = kept.exact.split(OBJECT_REPLACEMENT).length - 1;

  expect(pictures, "the kept text holds the picture as one character").toBeGreaterThan(0);

  const entry = listEntries(page).first();
  const quote = entry.locator(".hl-quote");

  await expect(quote).toBeVisible();
  await quote.scrollIntoViewIfNeeded();
  await attachScreenshot(page, test.info(), "reader-list");

  const text = (await quote.textContent()) ?? "";

  expect(text, "the raw character is not drawn").not.toContain(OBJECT_REPLACEMENT);
  expect(collapsed(text), "the words around the picture are all there").toBe(
    collapsed(kept.exact.replaceAll(OBJECT_REPLACEMENT, "")),
  );

  const placeholders = quote.getByRole("img", { name: PICTURE_LABEL, exact: true });

  await expect(placeholders).toHaveCount(pictures);
  await expect(placeholders.first()).toBeVisible();
  await expect(quote).toHaveAccessibleName(new RegExp(`\\b${PICTURE_LABEL}\\b`, "u"));

  const remove = entry.getByRole("button", { name: /^Remove highlight/u });

  await expect(remove).toHaveCount(1);
  expect(
    (await remove.getAttribute("aria-label")) ?? "",
    "the Remove button's name holds no raw character",
  ).not.toContain(OBJECT_REPLACEMENT);
  await expect(remove).toHaveAccessibleName(new RegExp(`\\b${PICTURE_LABEL}\\b`, "u"));
});
