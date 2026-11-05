import { type Page, expect } from "@playwright/test";

import { collectViolations } from "./design-checks.ts";
import { DEFAULT_FONT, app } from "./look.ts";

export const BANDS_AT_WIDTH = [
  [390, "phone narrow medium wide full"],
  [600, "narrow medium wide full"],
  [1440, "full"],
  [1920, "full"],
] as const;

export const THEMES = ["light", "dark", "sepia"] as const;

export async function resize(page: Page, width: number, bands: string): Promise<void> {
  await page.setViewportSize({ width, height: width < 480 ? 640 : 900 });
  await expect(app(page)).toHaveAttribute("data-bp", bands);
}

export async function expectNoViolations(page: Page, what: string): Promise<void> {
  expect(await page.evaluate(collectViolations, DEFAULT_FONT), what).toEqual([]);
}

export async function checkAtEveryWidth(page: Page, what: string): Promise<void> {
  for (const [width, bands] of BANDS_AT_WIDTH) {
    await resize(page, width, bands);
    await expectNoViolations(page, `${what} at ${width}px`);
  }
}
