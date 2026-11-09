import { expect, test } from "@playwright/test";

import {
  FILES,
  ItemAnswer,
  ListAnswer,
  expectLoaded,
  fileRequests,
  watchedPage,
} from "./article-image-screen.ts";
import { openArticleScreen } from "./article-screen.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { openPanel, pickOption } from "./look.ts";
import { MIXED_FAILED_IMAGE } from "./media-pages.ts";
import { imageRows } from "./media.ts";
import { reader, row } from "./reader.ts";

test.describe.configure({ timeout: 600_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

let screen: FreshScreen;
let articleId: number;
let plainId: number;
let routes: readonly string[];

test.beforeAll(async ({ browser }) => {
  ({ screen, articleId, plainId, routes } = await openArticleScreen(browser));
});

test.afterAll(async () => {
  await screen.close();
});

test("the list, status and detail answers carry the first stored image and its alt text, and nothing for an Item without one", async () => {
  const { request } = screen.context;
  const stored = imageRows(screen.fresh, articleId).filter(({ outcome }) => outcome === "stored");
  const first = stored.toSorted((a, b) => a.position - b.position)[0];

  expect(routes.length, "stored images in the text").toBeGreaterThanOrEqual(8);
  expect(
    stored.some(({ alt }) => alt !== ""),
    "an image with alt text",
  ).toBe(true);
  expect(first?.file_key).not.toBeNull();

  const wanted = { url: `${FILES}${first?.file_key ?? ""}`, alt: first?.alt };

  expect(wanted.url, "the first stored image is the first in the text").toBe(routes[0]);

  const list = ListAnswer.parse(await (await request.get("/api/items")).json());

  expect(list.items.find(({ id }) => id === articleId)?.image).toEqual(wanted);
  expect(list.items.find(({ id }) => id === plainId)?.image).toBeNull();

  for (const [id, image] of [
    [articleId, wanted],
    [plainId, null],
  ] as const) {
    for (const path of [`/api/items/${id}`, `/api/items/${id}/status`]) {
      const answer = ItemAnswer.parse(await (await request.get(path)).json());

      expect(answer.item.image, path).toEqual(image);
    }
  }

  const detail = ItemAnswer.parse(await (await request.get(`/api/items/${articleId}`)).json());

  expect(detail.item.postText, "the detail answer holds the post text").toContain(routes[0]);
  expect(JSON.stringify(list), "the list answer holds no post text").not.toContain("postText");
});

test("the Reader shows every stored image from its file route, keeps the failed image a link, and requests only stored files", async ({
  browser,
}) => {
  const { context, page, requests } = await watchedPage(browser, screen, {});

  await page.goto(`/items/${articleId}`);
  await expect(reader(page)).toBeVisible();
  await expectLoaded(page, ".rd-orig .md img.pic", routes.length);
  expect(
    await page
      .locator(".rd-orig .md img.pic")
      .evaluateAll((all) => all.map((img) => img.getAttribute("src"))),
  ).toEqual(routes);

  const alts = await page
    .locator(".rd-orig .md img.pic")
    .evaluateAll((all) => all.map((img) => img.getAttribute("alt")));

  expect(
    alts.some((alt) => alt !== null && alt !== ""),
    "alt text on a picture",
  ).toBe(true);

  const failed = reader(page).locator(`.md a[href="${MIXED_FAILED_IMAGE}"]`);

  await expect(failed).toHaveCount(1);
  await expect(failed).toHaveAttribute("target", "_blank");
  expect(requests, "the failed image is a link, so no one requests it").not.toContain(
    MIXED_FAILED_IMAGE,
  );
  expect(requests.some((url) => url.includes("githack.com/_astro"))).toBe(false);
  expect(new Set(fileRequests(requests).map((url) => new URL(url).pathname))).toEqual(
    new Set(routes),
  );
  await context.close();
});

function showsTheFirstImage(layout: "list" | "grid"): void {
  test(`${layout}: the first stored image is the row's or card's top-left crop, and an Item without one has none`, async ({
    browser,
  }) => {
    const { context, page } = await watchedPage(browser, screen, { layout });

    await page.goto("/");
    await expect(page.locator("article.it")).toHaveCount(2);

    const media = row(page, articleId).locator(".it-media");

    await expectLoaded(page, `article.it[data-key="${articleId}"] .it-media img`, 1);
    await expect(media.locator("img")).toHaveAttribute("src", routes[0] ?? "");
    await expect(row(page, plainId).locator(".it-media")).toHaveCount(0);
    await expect(row(page, plainId)).toHaveClass(/\btext-only\b/u);
    await expect(row(page, articleId)).not.toHaveClass(/\btext-only\b/u);

    const picture = await media.locator("img").evaluate((img) => {
      const style = getComputedStyle(img);

      return { fit: style.objectFit, position: style.objectPosition };
    });

    expect(picture).toEqual({ fit: "cover", position: "0% 0%" });

    const box = await media.boundingBox();

    if (layout === "list") expect(box).toMatchObject({ width: 40, height: 40 });
    else expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(1.6, 1);

    await context.close();
  });
}

showsTheFirstImage("list");

showsTheFirstImage("grid");

test("the Card images setting is in the panel, Off removes every card picture, and the Reader keeps its pictures", async ({
  browser,
}) => {
  const { page } = await watchedPage(browser, screen, { layout: "grid" });

  await page.goto("/");
  await expectLoaded(page, ".it-media img", 1);

  const dialog = await openPanel(page);

  await pickOption(dialog, "Card images", "Off");
  await expect(page.locator(".it-media")).toHaveCount(0);
  await pickOption(dialog, "Card images", "On");
  await expectLoaded(page, ".it-media img", 1);
});

function showsNoCardImage(layout: "list" | "grid"): void {
  test(`${layout} with Card images Off: no picture element, source, preload or request, and the Reader's pictures load`, async ({
    browser,
  }) => {
    const { context, page, requests } = await watchedPage(browser, screen, {
      layout,
      images: "off",
    });

    await page.goto("/");
    await expect(page.locator("article.it")).toHaveCount(2);
    await expect(row(page, articleId)).toHaveClass(/\btext-only\b/u);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator("article.it img, article.it picture, article.it source")).toHaveCount(
      0,
    );
    await expect(page.locator('link[rel="preload"], link[rel="prefetch"]')).toHaveCount(0);
    await expect(page.locator(".it-media")).toHaveCount(0);
    expect(fileRequests(requests), "no card picture is requested").toEqual([]);

    await row(page, articleId).locator("a.it-open").click();
    await expect(reader(page)).toBeVisible();
    await expectLoaded(page, ".rd-orig .md img.pic", routes.length);
    expect(fileRequests(requests).length, "the Reader's pictures are requested").toBeGreaterThan(0);
    await context.close();
  });
}

showsNoCardImage("list");

showsNoCardImage("grid");
