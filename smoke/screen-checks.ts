import { type Locator, type Page, expect } from "@playwright/test";

const PHONE = { width: 390, height: 844 };

const DESKTOP = { width: 1280, height: 800 };

const TARGET_PX = 44;

export async function expectTarget(target: Locator): Promise<void> {
  const box = await target.boundingBox();

  expect(box?.width).toBeGreaterThanOrEqual(TARGET_PX);
  expect(box?.height).toBeGreaterThanOrEqual(TARGET_PX);
}

export async function atPhoneWidth(page: Page, steps: () => Promise<void>): Promise<void> {
  await page.setViewportSize(PHONE);

  try {
    await steps();
  } finally {
    await page.setViewportSize(DESKTOP);
  }
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
