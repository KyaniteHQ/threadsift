import { expect, test } from "@playwright/test";

import { FILES, expectLoaded } from "./article-image-screen.ts";
import { type ArticleScreen, openArticleScreen } from "./article-screen.ts";
import { BANDS_AT_WIDTH, THEMES, expectNoViolations, resize } from "./design-screens.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { attachScreenshot, storeSettings, viewportAt } from "./look.ts";
import { imageRows } from "./media.ts";
import { reader } from "./reader.ts";

test.describe.configure({ timeout: 900_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

const WIDTHS = BANDS_AT_WIDTH.filter(([width]) => width === 390 || width === 1440);

let library: ArticleScreen;
let screen: FreshScreen;

test.beforeAll(async ({ browser }) => {
  library = await openArticleScreen(browser);
  ({ screen } = library);
});

test.afterAll(async () => {
  await screen.close();
});

test("the Reader's pictures break no design rule in Light, Dark and Sepia at 390 and 1440 px", async () => {
  const { page } = screen;
  const info = test.info();

  for (const theme of THEMES) {
    for (const [width, bands] of WIDTHS) {
      await viewportAt(page, width);
      await storeSettings(page, { theme }, `/items/${library.articleId}`);
      await resize(page, width, bands);
      await expect(reader(page)).toBeVisible();
      await expectLoaded(page, ".rd-orig .md img.pic", library.routes.length);
      await page.evaluate(() => document.fonts.ready);
      await expectNoViolations(page, `the Reader, ${theme} at ${width}px`);
      await page.locator(".rd-orig .md img.pic").first().scrollIntoViewIfNeeded();
      await attachScreenshot(page, info, `reader-${theme}-${width}`);
    }
  }
});

test("the List rows and Grid cards break no design rule in Light, Dark and Sepia at 390 and 1440 px", async () => {
  const { page } = screen;
  const info = test.info();

  for (const layout of ["list", "grid"] as const) {
    for (const theme of THEMES) {
      for (const [width, bands] of WIDTHS) {
        await viewportAt(page, width);
        await storeSettings(page, { theme, layout }, "/");
        await resize(page, width, bands);
        await expectLoaded(page, ".it-media img", 1);
        await page.evaluate(() => document.fonts.ready);
        await expectNoViolations(page, `the ${layout}, ${theme} at ${width}px`);
        await attachScreenshot(page, info, `${layout}-${theme}-${width}`);
      }
    }
  }
});

test("a stored file the browser cannot show falls back to its alt text and a link", async () => {
  const { page } = screen;

  const stored = imageRows(screen.fresh, library.articleId).filter(
    ({ outcome }) => outcome === "stored",
  );

  const last = stored.toSorted((a, b) => b.position - a.position)[0];
  const key = last?.file_key ?? "";

  expect(last?.size, "the stored size").toBeGreaterThan(0);
  screen.fresh.writeFile(key, Buffer.alloc(last?.size ?? 0, 0x20));

  await viewportAt(page, 1440);
  await storeSettings(page, {}, `/items/${library.articleId}`);
  await expect(reader(page)).toBeVisible();

  const route = `${FILES}${key}`;

  const fallback = reader(page).locator(`.md a[href="${route}"]`);

  await expect(async () => {
    await page.locator(".reader-slot").evaluate((slot) => {
      slot.scrollTo(0, slot.scrollHeight);
    });
    await expect(fallback).toHaveCount(library.routes.filter((r) => r === route).length, {
      timeout: 1000,
    });
  }).toPass();
  await expect(fallback).toHaveText(last?.alt === "" ? route : (last?.alt ?? route));
  await expect(reader(page).locator(`.md img[src="${route}"]`)).toHaveCount(0);
  await expectLoaded(
    page,
    ".rd-orig .md img.pic",
    library.routes.filter((r) => r !== route).length,
  );
});
