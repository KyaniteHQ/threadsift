import { type Page, expect, test } from "@playwright/test";

import { SETTINGS } from "../web/src/access-text.ts";
import { openPanel, px, seedItems } from "./look.ts";

const DESKTOP = { width: 1440, height: 900 } as const;
const PHONE = { width: 390, height: 844 } as const;
const HALF_PIXEL = 0.5;

async function openSettings(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: SETTINGS.title })).toBeFocused();
}

async function fontSize(page: Page, name: string): Promise<number> {
  const size = await page
    .getByRole("heading", { name, exact: true })
    .evaluate((heading) => getComputedStyle(heading).fontSize);

  return px(size);
}

for (const [label, size] of [
  ["desktop", DESKTOP],
  ["phone", PHONE],
] as const) {
  test(`on ${label} the page title outranks its section headings`, async ({ page }) => {
    await openSettings(page, size);

    const title = await fontSize(page, SETTINGS.title);
    expect(title, "page title against Agent tokens").toBeGreaterThan(
      await fontSize(page, SETTINGS.tokensTitle),
    );
    expect(title, "page title against Sign out").toBeGreaterThan(
      await fontSize(page, SETTINGS.signOutTitle),
    );
  });

  test(`on ${label} the bar starts where the column starts`, async ({ page }) => {
    await openSettings(page, size);

    const back = await page.getByRole("link", { name: SETTINGS.back }).boundingBox();
    const column = await page.locator(".pg-col").locator(".sec").first().boundingBox();
    expect(back?.x, "Back starts where the column starts").toBeCloseTo(column?.x ?? -1, 0);
  });
}

test("Sign out stretches to the column on a phone and keeps its width on a desktop", async ({
  page,
}) => {
  const button = page.getByRole("button", { name: SETTINGS.signOut, exact: true });
  const column = page.locator(".pg-col .sec").last();

  await openSettings(page, PHONE);
  const stretched = await button.boundingBox();
  const sectionOnPhone = await column.boundingBox();
  expect(stretched?.width).toBeGreaterThanOrEqual((sectionOnPhone?.width ?? Infinity) - HALF_PIXEL);

  await openSettings(page, DESKTOP);
  const natural = await button.boundingBox();
  const sectionOnDesktop = await column.boundingBox();
  expect(natural?.width).toBeLessThan((sectionOnDesktop?.width ?? 0) / 2);
});

test("the Instance settings link sits apart from the Look settings, under a hairline", async ({
  page,
}) => {
  await seedItems(page);
  await page.setViewportSize(DESKTOP);
  await page.goto("/");
  const dialog = await openPanel(page);
  const link = dialog.getByRole("link", { name: SETTINGS.instanceSettings });

  await expect(dialog.locator(".st-body").getByRole("link")).toHaveCount(0);

  const rule = await link.evaluate((anchor) => {
    const part = anchor.closest(".st-more");

    return part === null ? "no .st-more part" : getComputedStyle(part).borderTopWidth;
  });

  expect(px(rule), "hairline above the link").toBeGreaterThan(0);

  const linkBox = await link.boundingBox();
  const bodyBox = await dialog.locator(".st-body").boundingBox();
  const footBox = await dialog.locator(".st-foot").boundingBox();
  expect(linkBox?.y).toBeGreaterThanOrEqual((bodyBox?.y ?? Infinity) + (bodyBox?.height ?? 0) - 1);
  expect((linkBox?.y ?? Infinity) + (linkBox?.height ?? 0)).toBeLessThanOrEqual(footBox?.y ?? 0);
});
