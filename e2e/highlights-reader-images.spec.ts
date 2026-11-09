import { type Locator, expect, test } from "@playwright/test";

import { openArticleScreen } from "./article-screen.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import {
  keepButton,
  markedText,
  marks,
  openReader,
  popover,
  selectBetween,
} from "./highlight-reader.ts";
import { highlightsOf } from "./highlights.ts";
import { DESKTOP } from "./look.ts";
import { reader } from "./reader.ts";

test.describe.configure({ timeout: 600_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

let screen: FreshScreen;
let articleId: number;

test.beforeAll(async ({ browser }) => {
  ({ screen, articleId } = await openArticleScreen(browser));
});

test.afterAll(async () => {
  await screen.close();
});

function collapsed(text: string): string {
  return text.replaceAll(/\s+/gu, " ");
}

interface Around {
  readonly before: string;
  readonly after: string;
  readonly shown: string;
}

function around(body: Locator, index: number): Promise<Around> {
  return body.evaluate((root, at) => {
    const picture = root.querySelectorAll(".rd-media")[at];
    const image = picture?.querySelector("img");

    if (picture === undefined || image === null || image === undefined) {
      throw new Error(`no stored picture ${at}`);
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let before = "";
    let after = "";

    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = node.nodeValue?.trim() ?? "";
      const outside = !picture.contains(node) && node.parentElement?.closest("a, pre") === null;

      if (text.length < 20 || !outside) continue;

      if (picture.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING) {
        before = text.slice(-20).trim();
      } else if (after === "") {
        after = text.slice(0, 20).trim();
      }
    }

    return {
      before,
      after,
      shown: image.alt === "" ? (image.getAttribute("src") ?? "") : image.alt,
    };
  }, index);
}

async function keepAround(index: number): Promise<{ id: number; exact: string; around: Around }> {
  const { page, context } = screen;

  await openReader(page, articleId, DESKTOP.width);
  const body = reader(page).locator(".md").first();
  const found = await around(body, index);
  const before = (await highlightsOf(context.request, articleId)).items.length;

  await selectBetween(body, found.before, found.after);
  await expect(keepButton(page)).toBeVisible();
  await keepButton(page).click();
  await expect(popover(page)).toBeHidden();

  await expect
    .poll(async () => (await highlightsOf(context.request, articleId)).items.length)
    .toBe(before + 1);

  const saved = (await highlightsOf(context.request, articleId)).items.at(-1);

  expect(saved?.status).toBe("attached");

  return { id: saved?.id ?? 0, exact: saved?.selector.exact ?? "", around: found };
}

test("a passage that runs across a stored picture is kept with the picture's alt text and the picture stays drawn", async () => {
  const { page } = screen;
  const kept = await keepAround(0);
  const body = reader(page).locator(".md").first();
  const pictures = await body.locator(".rd-media img").count();

  expect(kept.exact).toContain(kept.around.shown);
  expect(collapsed(kept.exact).startsWith(collapsed(kept.around.before))).toBe(true);

  await expect(body.locator(`mark[data-highlights~="${kept.id}"]`).first()).toBeVisible();
  await expect(
    body.locator(`mark[data-highlights~="${kept.id}"] .rd-media img`),
    "the covered picture is still an image inside the mark",
  ).not.toHaveCount(0);
  expect(await markedText(body)).toContain(kept.around.after);

  await page.reload();
  await expect(body.locator(".rd-media img").first()).toBeVisible();
  await expect(body.locator(".rd-media img")).toHaveCount(pictures);
  await expect(marks(body).first()).toBeVisible();
});

test("a passage after a stored picture is accepted at the right place and marked over the same text", async () => {
  const { page } = screen;
  const kept = await keepAround(1);
  const body = reader(page).locator(".md").first();

  expect(collapsed(kept.exact).endsWith(collapsed(kept.around.after))).toBe(true);
  await expect(body.locator(`mark[data-highlights~="${kept.id}"]`).first()).toBeVisible();
  expect(await markedText(body)).toContain(kept.around.after);
});
