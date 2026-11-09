import { type BrowserContext, type Page, expect } from "@playwright/test";

import { STORAGE_KEY } from "../design/system/settings.ts";
import { LAST_LIST_KEY } from "../web/src/last-list.ts";
import { EMPTY_LIST } from "../web/src/text.ts";
import { watchLayout } from "./layout-shift.ts";
import { afterTwoFrames, delayFonts } from "./look.ts";
import { reader } from "./reader.ts";

export const PHONE = { width: 390, height: 844 } as const;

const FONT_DELAY_MS = 500;

export interface Visit {
  readonly size: Readonly<{ width: number; height: number }>;
  readonly stored: Readonly<Record<string, string>>;
  readonly path: string;
  readonly settled: (page: Page, release: () => void) => Promise<void>;
  readonly forgetLastList?: boolean;
  readonly hold?: RegExp;
}

export async function storeLook(page: Page, stored: Visit["stored"]): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value);
    },
    { key: STORAGE_KEY, value: JSON.stringify(stored) },
  );
}

export async function shiftOf(
  context: BrowserContext,
  { size, stored, path, settled, forgetLastList = false, hold }: Readonly<Visit>,
): Promise<number> {
  const page = await context.newPage();
  const release = Promise.withResolvers<void>();

  try {
    await page.setViewportSize(size);
    await storeLook(page, stored);

    if (forgetLastList)
      await page.addInitScript((key) => {
        localStorage.removeItem(key);
      }, LAST_LIST_KEY);

    if (hold !== undefined)
      await page.route(hold, async (route) => {
        const response = await route.fetch();
        await release.promise;
        await route.fulfill({ response });
      });

    const watch = await watchLayout(page);
    await delayFonts(page, FONT_DELAY_MS);
    await page.goto(path);
    await settled(page, release.resolve);
    await afterTwoFrames(page);
    await afterTwoFrames(page);

    return (await watch.snapshot()).shift;
  } finally {
    release.resolve();
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.close();
  }
}

export async function emptyLibrary(page: Page) {
  await expect(page.getByRole("heading", { name: EMPTY_LIST.heading })).toBeVisible();
}

export async function listedItems(page: Page) {
  await expect(page.locator("article.it").first()).toBeVisible();
}

export async function openedItem(page: Page) {
  await expect(reader(page)).toBeVisible();
  await expect(page.locator(".rd-comments li.cm").first()).toBeVisible();
  await expect(page.locator(".rd-loading")).toHaveCount(0);
}

export async function autoOpened(page: Page) {
  await listedItems(page);
  await expect(reader(page)).toBeVisible();
  await expect(page.locator(".rd-loading")).toHaveCount(0);
  await expect(page.locator(".rd-head:not([inert])")).toBeVisible();
}

export async function itemReadHeld(page: Page, release: () => void) {
  await listedItems(page);
  await expect(page.locator(".rd-loading")).toBeVisible();
  release();
  await autoOpened(page);
}

export const ITEMS_READ = /\/api\/items(\?[^/]*)?$/u;
export const ITEM_READ = /\/api\/items\/\d+$/u;

export async function rowsGap(
  context: BrowserContext,
  { size, stored }: Readonly<Pick<Visit, "size" | "stored">>,
) {
  const page = await context.newPage();
  const release = Promise.withResolvers<void>();

  try {
    await page.setViewportSize(size);

    await storeLook(page, stored);

    await page.route(ITEMS_READ, async (route) => {
      const response = await route.fetch();
      await release.promise;
      await route.fulfill({ response });
    });

    await page.goto("/");

    const ghost = page.locator(".it-ghost").first();
    await expect(ghost).toBeVisible();
    const ghostTop = await ghost.evaluate((element) => element.getBoundingClientRect().top);

    release.resolve();
    await listedItems(page);
    await afterTwoFrames(page);

    const rowTop = await page
      .locator("article.it")
      .first()
      .evaluate((element) => element.getBoundingClientRect().top);

    return rowTop - ghostTop;
  } finally {
    release.resolve();
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.close();
  }
}
