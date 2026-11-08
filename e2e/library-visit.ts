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
  readonly settled: (page: Page) => Promise<void>;
  readonly forgetLastList?: boolean;
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
  { size, stored, path, settled, forgetLastList = false }: Readonly<Visit>,
): Promise<number> {
  const page = await context.newPage();

  try {
    await page.setViewportSize(size);
    await storeLook(page, stored);

    if (forgetLastList)
      await page.addInitScript((key) => {
        localStorage.removeItem(key);
      }, LAST_LIST_KEY);

    const watch = await watchLayout(page);
    await delayFonts(page, FONT_DELAY_MS);
    await page.goto(path);
    await settled(page);
    await afterTwoFrames(page);
    await afterTwoFrames(page);

    return (await watch.snapshot()).shift;
  } finally {
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
