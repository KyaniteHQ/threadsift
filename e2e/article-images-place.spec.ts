import { type Browser, type Locator, type Page, expect, test } from "@playwright/test";

import { FILES, expectLoaded, watchedPage } from "./article-image-screen.ts";
import { type ArticleScreen, openArticleScreen } from "./article-screen.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { fontsLoaded } from "./look.ts";
import { imageRows } from "./media.ts";

test.describe.configure({ timeout: 600_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

const HELD = /\/api\/files\/items\/\d+\/img-/u;
const PLACES_KEY = "threadsift:reading-places";
const SETTLED_AFTER_MS = 1200;
const TOLERANCE_PX = 1;

let library: ArticleScreen;
let screen: FreshScreen;

test.beforeAll(async ({ browser }) => {
  library = await openArticleScreen(browser);
  ({ screen } = library);
});

test.afterAll(async () => {
  await screen.close();
});

function blocks(page: Page): Locator {
  return page.locator(".rd-orig .md > *");
}

function paragraphBelowFirstImage(page: Page): Promise<number> {
  return blocks(page).evaluateAll((all) => {
    const first = all.findIndex((block) => block.querySelector(".rd-media") !== null);

    return all.findIndex(
      (block, at) => at > first && block.tagName === "P" && (block.textContent ?? "").length > 80,
    );
  });
}

function topOf(block: Locator): Promise<number> {
  return block.evaluate((element) => element.getBoundingClientRect().top);
}

async function scrollTo(page: Page, block: Locator): Promise<void> {
  await block.evaluate((element) => {
    const slot = element.closest(".reader-slot");
    const bar = slot?.querySelector<HTMLElement>(".rd-bar");

    if (slot === null || slot === undefined) throw new Error("no reader slot");

    slot.scrollTop +=
      element.getBoundingClientRect().top -
      (slot.getBoundingClientRect().top + (bar?.offsetHeight ?? 0)) -
      4;
  });
  await expect
    .poll(() => page.evaluate((key) => sessionStorage.getItem(key) ?? "", PLACES_KEY))
    .toContain(`"${library.articleId}"`);
}

async function reopenWithImagesHeld(
  page: Page,
  at: number,
): Promise<{ readonly release: () => void; readonly target: Locator }> {
  const gate = Promise.withResolvers<void>();

  await page.route(HELD, async (route) => {
    await gate.promise;
    await route.continue();
  });
  await page.reload();
  await expect(blocks(page).nth(at)).toBeVisible();
  await fontsLoaded(page);
  await expect
    .poll(() => page.locator(".reader-slot").evaluate((slot) => slot.scrollTop))
    .toBeGreaterThan(0);
  await page.waitForTimeout(SETTLED_AFTER_MS);

  return {
    release: gate.resolve,
    target: blocks(page).nth(at),
  };
}

async function expectPlaceKept(
  browser: Browser,
  settledImage: (page: Page) => Promise<void>,
): Promise<void> {
  const { context, page } = await watchedPage(browser, screen, {});

  try {
    await page.goto(`/items/${library.articleId}`);
    await expect(page.locator(".rd-orig .md img.pic").first()).toBeVisible();

    const at = await paragraphBelowFirstImage(page);

    expect(at, "a paragraph after the first picture").toBeGreaterThan(0);
    await scrollTo(page, blocks(page).nth(at));

    const { release, target } = await reopenWithImagesHeld(page, at);
    const before = await topOf(target);

    release();
    await settledImage(page);
    await expect
      .poll(async () => Math.abs((await topOf(target)) - before), {
        message: "the paragraph is back where it was",
      })
      .toBeLessThanOrEqual(TOLERANCE_PX);
  } finally {
    await context.close();
  }
}

function firstPicture(page: Page): Locator {
  return page.locator(".rd-orig .md img.pic").first();
}

test("every stored picture is rendered with the size the browser decodes", async ({ browser }) => {
  const { context, page } = await watchedPage(browser, screen, {});

  try {
    await page.goto(`/items/${library.articleId}`);
    await expectLoaded(page, ".rd-orig .md img.pic", library.routes.length);

    const sizes = await page
      .locator(".rd-orig .md img.pic")
      .evaluateAll((all: HTMLImageElement[]) =>
        all.map((img) => ({
          declared: [img.getAttribute("width"), img.getAttribute("height")],
          decoded: [String(img.naturalWidth), String(img.naturalHeight)],
        })),
      );

    expect(sizes.length, "pictures in the text").toBeGreaterThanOrEqual(8);

    for (const { declared, decoded } of sizes) {
      expect(declared).toEqual(decoded);
    }
  } finally {
    await context.close();
  }
});

test("a paragraph below a stored image keeps its place when the image's response arrives after the place was restored", async ({
  browser,
}) => {
  await expectPlaceKept(browser, async (page) => {
    await expect(firstPicture(page)).toHaveAttribute("width", /^\d+$/u);
    await expect
      .poll(() =>
        firstPicture(page).evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
      )
      .toBe(true);
  });
});

test("the same holds when the held image is refused by the file route and becomes a link", async ({
  browser,
}) => {
  const route = library.routes[0] ?? "";
  const key = route.slice(FILES.length);

  const original = imageRows(screen.fresh, library.articleId).find(
    (row) => row.file_key === key,
  )?.content_type;

  expect(original, "the stored type of the refused image").toBeTruthy();
  screen.fresh.sql(`UPDATE media SET content_type = 'text/plain' WHERE file_key = '${key}'`);

  try {
    await expectPlaceKept(browser, async (page) => {
      await expect(page.locator(`.rd-orig .md a[href="${route}"]`)).toHaveCount(1);
    });
  } finally {
    screen.fresh.sql(`UPDATE media SET content_type = '${original}' WHERE file_key = '${key}'`);
  }
});

test("the same holds for a stored image saved without its size", async ({ browser }) => {
  screen.fresh.sql(
    `UPDATE media SET width = NULL, height = NULL WHERE item_id = ${library.articleId}`,
  );
  await expectPlaceKept(browser, async (page) => {
    await expect(firstPicture(page)).not.toHaveAttribute("width", /.*/u);
    await expect
      .poll(() =>
        firstPicture(page).evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
      )
      .toBe(true);
  });
});
