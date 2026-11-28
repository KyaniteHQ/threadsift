import { type Locator, type Page, expect } from "@playwright/test";

import { SETTINGS } from "../web/src/access-text.ts";
import { MENU_LABEL, ownerMenuLabel } from "../web/src/text.ts";

const PHONE = { width: 390, height: 844 };

const WIDE = { width: 1920, height: 1080 };

const TARGET_PX = 44;

export async function expectTarget(target: Locator): Promise<void> {
  const box = await target.boundingBox();

  expect(box?.width).toBeGreaterThanOrEqual(TARGET_PX);
  expect(box?.height).toBeGreaterThanOrEqual(TARGET_PX);
}

async function atSize(
  page: Page,
  size: Readonly<{ width: number; height: number }>,
  steps: () => Promise<void>,
): Promise<void> {
  const entry = page.viewportSize();

  if (entry === null) throw new Error("the smoke runs with a fixed viewport");

  await page.setViewportSize(size);

  try {
    await steps();
  } finally {
    await page.setViewportSize(entry);
  }
}

export function atPhoneWidth(page: Page, steps: () => Promise<void>): Promise<void> {
  return atSize(page, PHONE, steps);
}

export function atWideWidth(page: Page, steps: () => Promise<void>): Promise<void> {
  return atSize(page, WIDE, steps);
}

const masthead = (page: Page) => page.getByRole("banner");

export async function openOwnerMenu(page: Page): Promise<void> {
  await masthead(page)
    .getByRole("button", { name: ownerMenuLabel(new URL(page.url()).host), exact: true })
    .click();
}

export async function openPhoneMenu(page: Page): Promise<void> {
  await masthead(page).getByRole("button", { name: MENU_LABEL, exact: true }).click();
}

export async function openFromMasthead(page: Page, name: string): Promise<void> {
  await page.goto("/");
  await masthead(page).getByRole("link", { name, exact: true }).click();
}

export async function openInstanceSettings(page: Page): Promise<void> {
  await page.goto("/");
  await openOwnerMenu(page);
  await page.getByRole("link", { name: SETTINGS.instanceSettings, exact: true }).click();
}

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

export const expectFitsPhone = (page: Page): Promise<void> =>
  atPhoneWidth(page, () => expectNoSidewaysScroll(page));

export async function expectScrollEnded(scroller: Locator): Promise<void> {
  await expect
    .poll(() =>
      scroller.evaluate(async (element) => {
        const before = element.scrollTop;

        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        });

        return element.scrollTop - before;
      }),
    )
    .toBe(0);
}
