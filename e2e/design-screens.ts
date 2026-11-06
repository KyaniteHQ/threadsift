import { type Page, expect } from "@playwright/test";

import { DEFAULTS } from "../design/system/settings.ts";
import { collectDesign } from "./design-checks.ts";
import { app, viewportAt } from "./look.ts";

export const BANDS_AT_WIDTH = [
  [390, "phone narrow medium wide full"],
  [600, "narrow medium wide full"],
  [1440, "full"],
  [1920, "full"],
] as const;

export const THEMES = ["light", "dark", "sepia"] as const;

export async function resize(page: Page, width: number, bands: string): Promise<void> {
  await viewportAt(page, width);
  await expect(app(page)).toHaveAttribute("data-bp", bands);
}

export async function expectNoViolations(page: Page, what: string): Promise<void> {
  expect((await page.evaluate(collectDesign, DEFAULTS.font)).violations, what).toEqual([]);
}

export async function checkAtEveryWidth(
  page: Page,
  what: string,
  widths: readonly (readonly [number, string])[] = BANDS_AT_WIDTH,
): Promise<void> {
  for (const [width, bands] of widths) {
    await resize(page, width, bands);
    await expectNoViolations(page, `${what} at ${width}px`);
  }
}

export function expectTokenContrast(
  contrast: readonly Readonly<ReturnType<typeof collectDesign>["contrast"][number]>[],
  what: string,
): void {
  for (const pair of contrast) {
    expect(pair.ratio, `${what}: ${pair.fg} on ${pair.bg}`).toBeGreaterThanOrEqual(pair.minimum);
  }
}
