import { type Locator, type Page, expect, test } from "@playwright/test";

import { SETTINGS } from "../design/system/settings.ts";
import { app, gear, openPanel, seedItems, storeSettings } from "./look.ts";

async function openAtRootSize(page: Page, width: number, percent: number) {
  await seedItems(page);
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/");
  await page.evaluate((size) => {
    document.documentElement.style.fontSize = `${size}%`;
  }, percent);

  return openPanel(page);
}

test("at a 200% root font size the popover widens with it and keeps every row and option inside", async ({
  page,
}) => {
  const dialog = await openAtRootSize(page, 1440, 200);
  const box = await dialog.boundingBox();

  expect(box?.width, "the popover is 25rem at a 32px rem").toBeGreaterThan(700);

  const overflow = await dialog.evaluate((element) => {
    const out: string[] = [];

    for (const part of element.querySelectorAll<HTMLElement>(".st-body, .st-row, .st-seg")) {
      if (part.scrollWidth > part.clientWidth + 0.5) {
        out.push(`${part.className}: ${part.scrollWidth} over ${part.clientWidth}`);
      }
    }

    for (const option of element.querySelectorAll<HTMLElement>(".st-b")) {
      const frame = option.parentElement?.getBoundingClientRect();

      if (option.getBoundingClientRect().right > (frame?.right ?? 0) + 0.5) {
        out.push(`option ${option.textContent} leaves its frame`);
      }
    }

    return out;
  });

  expect(overflow).toEqual([]);
});

async function expectLabelsAboveControls(dialog: Locator): Promise<void> {
  for (const row of await dialog.locator(".st-row").all()) {
    const label = await row.locator(".st-l").boundingBox();
    const control = await row.locator(".st-seg, .st-sws, .st-sel").boundingBox();

    expect(
      (label?.y ?? 0) + (label?.height ?? 0),
      "the label ends above the control",
    ).toBeLessThanOrEqual(control?.y ?? 0);
  }

  const sideways = await dialog.evaluate((element) => element.scrollWidth - element.clientWidth);

  expect(sideways, "nothing scrolls sideways").toBeLessThanOrEqual(0);
}

test("a popover narrower than its rows can use, and a sheet under 480px, stack each label above its control", async ({
  page,
}) => {
  await expectLabelsAboveControls(await openAtRootSize(page, 780, 200));
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 700 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await expectLabelsAboveControls(await openPanel(page));
});

test("the gear sits on the wordmark's centre line at the row's end whatever the Font", async ({
  page,
}) => {
  await seedItems(page);

  for (const width of [390, 600, 900, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const rights: number[] = [];
    const fonts = SETTINGS.find((row) => row.key === "font")?.options ?? [];

    for (const { id } of fonts) {
      await storeSettings(page, { font: id });
      await expect(app(page)).toHaveAttribute("data-font", id);

      const [wordmark, gearBox, brand] = await Promise.all([
        page.locator(".brand h1").boundingBox(),
        gear(page).boundingBox(),
        page.locator(".brand").boundingBox(),
      ]);

      const wordmarkMiddle = (wordmark?.y ?? 0) + (wordmark?.height ?? 0) / 2;
      const gearMiddle = (gearBox?.y ?? 0) + (gearBox?.height ?? 0) / 2;

      expect(
        Math.abs(gearMiddle - wordmarkMiddle),
        `${width}px, ${id}: centre offset`,
      ).toBeLessThanOrEqual(1);
      rights.push((gearBox?.x ?? 0) + (gearBox?.width ?? 0));
      expect(rights.at(-1), `${width}px, ${id}: at the row's end`).toBeGreaterThan(
        (brand?.x ?? 0) + (brand?.width ?? 0) - 24,
      );
    }

    expect(
      Math.max(...rights) - Math.min(...rights),
      `${width}px: the Font does not move the gear`,
    ).toBeLessThanOrEqual(0.5);
  }
});
