import { type Locator, type Page, expect } from "@playwright/test";

import { HIGHLIGHTS_PAGE } from "../web/src/highlights-page-text.ts";
import { type Stored, fontsLoaded, storeSettings, viewportAt } from "./look.ts";

export const HIGHLIGHTS_URL = "/highlights";

export function entries(page: Page): Locator {
  return page.locator("article.hp-it");
}

export function links(page: Page): Locator {
  return page.locator("a.hp-open");
}

export function results(page: Page): Locator {
  return page.locator("#results");
}

export function searchBox(page: Page): Locator {
  return page.getByRole("searchbox", { name: HIGHLIGHTS_PAGE.searchLabel });
}

export function moreButton(page: Page): Locator {
  return page.getByRole("button", { name: HIGHLIGHTS_PAGE.loadMore, exact: true });
}

export function textsOnPage(page: Page): Promise<string[]> {
  return page.locator("article.hp-it .hp-text").allTextContents();
}

export async function openPage(page: Page, width: number, stored: Stored = {}): Promise<void> {
  await viewportAt(page, width);
  await storeSettings(page, stored, HIGHLIGHTS_URL);
  await expect(page.getByRole("heading", { level: 1, name: HIGHLIGHTS_PAGE.title })).toBeVisible();
  await fontsLoaded(page);
}

export async function waitForEntries(page: Page, count: number): Promise<void> {
  await expect(entries(page)).toHaveCount(count);
}
