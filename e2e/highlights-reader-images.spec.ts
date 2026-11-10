import { type Locator, expect, test } from "@playwright/test";

import { type ArticleScreen, openArticleScreen, refreshArticle } from "./article-screen.ts";
import { keepBetween, markedText, marks, openReader } from "./highlight-reader.ts";
import { highlightsOf } from "./highlights.ts";
import { DESKTOP } from "./look.ts";
import { reader } from "./reader.ts";

test.describe.configure({ timeout: 600_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

const STORED_PICTURE = ".rd-media";

const FAILED_PICTURE = "a[data-failed-picture]";

let library: ArticleScreen;

test.beforeAll(async ({ browser }) => {
  library = await openArticleScreen(browser);
});

test.afterAll(async () => {
  await library.screen.close();
});

function collapsed(text: string): string {
  return text.replaceAll(/\s+/gu, " ");
}

interface Around {
  readonly before: string;
  readonly after: string;
  readonly shown: string;
}

function around(body: Locator, selector: string, index: number): Promise<Around> {
  return body.evaluate(
    (root, [picturesSelector, at]) => {
      const picture = root.querySelectorAll(picturesSelector ?? "")[at];

      if (picture === undefined) throw new Error(`no ${picturesSelector} at ${at}`);

      const image = picture.querySelector("img");
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
        shown:
          image === null ? "" : image.alt === "" ? (image.getAttribute("src") ?? "") : image.alt,
      };
    },
    [selector, index] as const,
  );
}

async function openArticleBody(): Promise<Locator> {
  const { page } = library.screen;

  await openReader(page, library.articleId, DESKTOP.width);

  return reader(page).locator(".md").first();
}

async function keepAround(index: number) {
  const body = await openArticleBody();
  const found = await around(body, STORED_PICTURE, index);
  const { screen, articleId } = library;

  return {
    ...(await keepBetween(screen, articleId, body, found.before, found.after)),
    around: found,
  };
}

function emptyAltPicture(body: Locator): Promise<number> {
  return body.evaluate((root) =>
    Array.from(root.querySelectorAll(".rd-media")).findIndex(
      (picture) => picture.querySelector("img")?.alt === "",
    ),
  );
}

test("a passage that runs across a stored picture is kept with the picture's alt text and the picture stays drawn", async () => {
  const { page } = library.screen;
  const kept = await keepAround(0);
  const body = reader(page).locator(".md").first();
  const pictures = await body.locator(".rd-media img").count();

  expect(kept.exact).toContain(kept.around.shown);
  expect(collapsed(kept.exact).startsWith(collapsed(kept.around.before))).toBe(true);

  await expect(body.locator(`mark[data-highlights~="${kept.id}"]`).first()).toBeVisible();
  await expect(
    body.locator(`.rd-media mark[data-highlights~="${kept.id}"] img`),
    "the covered picture is still an image inside the mark",
  ).not.toHaveCount(0);
  expect(await markedText(body)).toContain(kept.around.after);

  await page.reload();
  await expect(body.locator(".rd-media img").first()).toBeVisible();
  await expect(body.locator(".rd-media img")).toHaveCount(pictures);
  await expect(marks(body).first()).toBeVisible();
});

test("a passage that starts and ends after a stored picture is kept as selected and only that passage is marked", async () => {
  const { screen, articleId } = library;
  const body = await openArticleBody();
  const found = await around(body, STORED_PICTURE, 1);
  const kept = await keepBetween(screen, articleId, body, found.after, found.after);
  const mine = body.locator(`mark[data-highlights~="${kept.id}"]`);

  expect(kept.exact).toBe(collapsed(found.after));
  await expect(mine.first()).toBeVisible();
  expect(collapsed((await mine.allTextContents()).join(""))).toBe(collapsed(found.after));
  await expect(mine.locator(".rd-media, img")).toHaveCount(0);
  await expect(body.locator(".rd-media img")).not.toHaveCount(0);
});

test("a passage after a stored picture that failed to load is kept at the right place", async () => {
  const { page } = library.screen;
  const { screen, articleId } = library;
  const loaded = await openArticleBody();
  const route = await loaded.locator("img[alt='']").first().getAttribute("src");

  expect(route, "a stored picture with empty alt text").not.toBeNull();
  await page.route(`**${route ?? ""}`, (request) => request.abort());

  const body = await openArticleBody();

  await body.locator("img[alt='']").scrollIntoViewIfNeeded();
  await expect(body.locator(FAILED_PICTURE)).toHaveCount(1);

  const found = await around(body, FAILED_PICTURE, 0);
  const kept = await keepBetween(screen, articleId, body, found.after, found.after);

  expect(kept.exact).toBe(collapsed(found.after));
  await expect(body.locator(`mark[data-highlights~="${kept.id}"]`).first()).toBeVisible();
  await page.unroute(`**${route ?? ""}`);
});

test("a passage across a stored picture with empty alt text stays found and marked after the unchanged Article is refreshed", async () => {
  const { screen, articleId } = library;
  const body = await openArticleBody();
  const index = await emptyAltPicture(body);

  expect(index, "the Article has a stored picture with empty alt text").toBeGreaterThanOrEqual(0);

  const kept = await keepAround(index);
  const { before, after } = await refreshArticle(library);

  expect(after.toSorted(), "every picture is stored under a new key").not.toEqual(
    before.toSorted(),
  );

  const found = (await highlightsOf(screen.context.request, articleId)).items.find(
    ({ id }) => id === kept.id,
  );

  expect(found).toMatchObject({ id: kept.id, status: "attached" });
  expect(found?.selector.exact).toBe(kept.exact);
  expect(kept.exact).not.toContain("/api/files/");

  await openArticleBody();
  await expect(body.locator(`.rd-media mark[data-highlights~="${kept.id}"] img`)).not.toHaveCount(
    0,
  );
  expect(collapsed(await markedText(body))).toContain(collapsed(kept.around.after));
});
