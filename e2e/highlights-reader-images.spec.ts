import { expect, test } from "@playwright/test";

import { type ArticleScreen, openArticleScreen, refreshArticle } from "./article-screen.ts";
import {
  STORED_PICTURE,
  around,
  collapsed,
  emptyAltPicture,
  keepAround,
  openArticleBody,
} from "./highlight-pictures.ts";
import { keepBetween, markedText, marks } from "./highlight-reader.ts";
import { highlightsOf } from "./highlights.ts";
import { reader } from "./reader.ts";

test.describe.configure({ timeout: 600_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

const FAILED_PICTURE = "a[data-failed-picture]";

let library: ArticleScreen;

test.beforeAll(async ({ browser }) => {
  library = await openArticleScreen(browser);
});

test.afterAll(async () => {
  await library.screen.close();
});

test("a passage that runs across a stored picture is kept with the picture's alt text and the picture stays drawn", async () => {
  const { page } = library.screen;
  const kept = await keepAround(library, 0);
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
  const body = await openArticleBody(library);
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
  const loaded = await openArticleBody(library);
  const route = await loaded.locator("img[alt='']").first().getAttribute("src");

  expect(route, "a stored picture with empty alt text").not.toBeNull();
  await page.route(`**${route ?? ""}`, (request) => request.abort());

  const body = await openArticleBody(library);

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
  const body = await openArticleBody(library);
  const index = await emptyAltPicture(body);

  expect(index, "the Article has a stored picture with empty alt text").toBeGreaterThanOrEqual(0);

  const kept = await keepAround(library, index);
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

  await openArticleBody(library);
  await expect(body.locator(`.rd-media mark[data-highlights~="${kept.id}"] img`)).not.toHaveCount(
    0,
  );
  expect(collapsed(await markedText(body))).toContain(collapsed(kept.around.after));
});
