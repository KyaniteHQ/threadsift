import { devices, expect, test } from "@playwright/test";

import { sheet, showGrid } from "./grid.ts";
import { expectInsidePane } from "./highlight-design.ts";
import { keepButton, popover, selectBetween } from "./highlight-reader.ts";
import { SELECTED, screenForFile, seededItem } from "./highlight-screen.ts";
import { DESKTOP, storeSettings, viewportAt } from "./look.ts";
import { reader } from "./reader.ts";

const screenOf = screenForFile();

test("in a Grid sheet the Keep panel stays inside the sheet and Escape closes it before the sheet", async () => {
  const { page } = screenOf();
  const id = await seededItem(screenOf(), "g");
  await viewportAt(page, DESKTOP.width);
  await showGrid(page, "sheet", `/items/${id}`);
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).locator(".md").first()).toBeVisible();
  const body = sheet(page).locator(".md").first();

  await selectBetween(body, ...SELECTED);
  await expect(keepButton(page)).toBeVisible();
  await expectInsidePane(page);
  expect(
    await sheet(page).evaluate((dialog) => dialog.contains(document.querySelector(".hl-pop"))),
  ).toBe(true);

  await keepButton(page).focus();
  await page.keyboard.press("Escape");
  await expect(popover(page)).toBeHidden();
  await expect(sheet(page)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(sheet(page)).toBeHidden();
  await expect(page).toHaveURL(/\/$/u);
  await storeSettings(page, {}, "/");
});

test("on a touch screen the Keep panel sits below the selection and is 44 px high", async ({
  browser,
}) => {
  const id = await seededItem(screenOf(), "t");

  const context = await browser.newContext({
    ...devices["Pixel 7"],
    baseURL: screenOf().fresh.url,
    storageState: await screenOf().context.storageState(),
  });

  try {
    const page = await context.newPage();
    await page.goto(`/items/${id}`);
    await expect(reader(page).locator(".md").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const body = reader(page).locator(".md").first();
    await body.scrollIntoViewIfNeeded();
    await selectBetween(body, ...SELECTED);
    await expect(keepButton(page)).toBeVisible();

    const selection = await page.evaluate(() => {
      const rects = Array.from(document.getSelection()?.getRangeAt(0).getClientRects() ?? []);

      return Math.max(...rects.map((rect) => rect.bottom));
    });

    const box = await popover(page).boundingBox();
    const button = await keepButton(page).boundingBox();
    expect(box?.y ?? 0, "below the last line of the selection").toBeGreaterThan(selection);
    expect(button?.height).toBeGreaterThanOrEqual(44);
    expect(button?.width).toBeGreaterThanOrEqual(44);
  } finally {
    await context.close();
  }
});
