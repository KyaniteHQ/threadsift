import { type Page, expect } from "@playwright/test";

export const PHONE = { width: 390, height: 844 };

export const DESKTOP = { width: 1280, height: 800 };

export const TARGET_PX = 44;

export async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      column: (document.querySelector("main")?.scrollWidth ?? 0) - window.innerWidth,
    };
  });

  expect(overflow.page).toBeLessThanOrEqual(0);
  expect(overflow.column).toBeLessThanOrEqual(0);
}
