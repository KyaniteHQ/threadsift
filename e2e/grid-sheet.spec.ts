import { expect, test } from "@playwright/test";

import { NEXT_ITEM, PREVIOUS_ITEM } from "../web/src/reader-text.ts";
import { CLOSE_LABEL } from "../web/src/text.ts";
import { newCode, newPassword } from "./access.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { CARDS, expectInView, link, seedCards, sheet, showGrid } from "./grid.ts";
import { afterTwoFrames } from "./look.ts";
import { bar, reader, slot } from "./reader.ts";

let screen: FreshScreen;
let ids: readonly number[];

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
  ids = seedCards(screen);
});

test.afterEach(async () => {
  await screen.close();
});

test("a card opens a modal sheet at most 760 px wide over the dimmed grid, with Previous and Next wholly outside it", async () => {
  const { page } = screen;
  const target = ids[5] ?? 0;
  await page.setViewportSize({ width: 1440, height: 420 });
  await showGrid(page, "sheet");
  await expect(page.locator("article.it")).toHaveCount(CARDS);
  await link(page, target).scrollIntoViewIfNeeded();
  const scrolled = await page.locator(".lib").evaluate((lib) => lib.scrollTop);
  await link(page, target).click();

  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page)).toHaveJSProperty("open", true);
  await expect.poll(() => sheet(page).evaluate((dialog) => dialog.matches(":modal"))).toBe(true);
  await expect(sheet(page)).toHaveAccessibleName("Card number 6");
  await expect(page).toHaveURL(new RegExp(`/items/${target}$`, "u"));

  const dimming = await sheet(page).evaluate(
    (dialog) => getComputedStyle(dialog, "::backdrop").backgroundColor,
  );

  expect(dimming, "the backdrop dims the grid").not.toBe("rgba(0, 0, 0, 0)");

  const panel = await slot(page).boundingBox();
  const previous = await page.getByRole("button", { name: PREVIOUS_ITEM }).boundingBox();
  const next = await page.getByRole("button", { name: NEXT_ITEM }).boundingBox();
  expect(panel?.width, "the sheet is at most 760 px wide").toBe(760);
  expect(
    (previous?.x ?? 0) + (previous?.width ?? 0),
    "Previous sits left of the sheet",
  ).toBeLessThan(panel?.x ?? 0);
  expect(next?.x, "Next sits right of the sheet").toBeGreaterThan(
    (panel?.x ?? 0) + (panel?.width ?? 0),
  );

  await page.mouse.move(10, 10);
  await page.mouse.wheel(0, 600);
  await afterTwoFrames(page);

  const root = await page.evaluate(() => ({
    window: window.scrollY,
    page: document.scrollingElement?.scrollTop ?? 0,
    lib: document.querySelector(".lib")?.scrollTop ?? -1,
  }));

  expect(root, "nothing under the sheet scrolls").toEqual({ window: 0, page: 0, lib: scrolled });
});

test("Previous, Next and the arrow keys move through the shown Items in grid order, and Escape returns focus to the current card", async () => {
  const { page } = screen;
  const [first = 0, second = 0, third = 0] = ids;
  await page.setViewportSize({ width: 1440, height: 900 });
  await showGrid(page, "sheet");
  await link(page, first).click();
  await expect(sheet(page)).toBeVisible();
  await expect(page.getByRole("button", { name: PREVIOUS_ITEM })).toBeDisabled();

  await page.getByRole("button", { name: NEXT_ITEM }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${second}$`, "u"));
  await expect(reader(page).locator(".rd-title")).toHaveText("Card number 2");
  await expect(page.getByRole("button", { name: PREVIOUS_ITEM })).toBeEnabled();
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(new RegExp(`/items/${third}$`, "u"));
  await page.keyboard.press("ArrowLeft");
  await expect(page).toHaveURL(new RegExp(`/items/${second}$`, "u"));
  await page.getByRole("button", { name: PREVIOUS_ITEM }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${first}$`, "u"));
  await page.keyboard.press("j");
  await expect(page).toHaveURL(new RegExp(`/items/${second}$`, "u"));

  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/u);
  await expect(link(page, second)).toBeFocused();
  await expectInView(page, page.locator(`article.it[data-key="${second}"]`));
});

test("the last Item disables Next, the close button and a click on the dimmed grid both close the sheet, and a drag that ends outside does not", async () => {
  const { page } = screen;
  const last = ids.at(-1) ?? 0;
  await page.setViewportSize({ width: 1440, height: 900 });
  await showGrid(page, "sheet", `/items/${last}`);
  await expect(sheet(page)).toBeVisible();
  await expect(page.getByRole("button", { name: NEXT_ITEM })).toBeDisabled();

  const panel = await slot(page).boundingBox();
  await page.mouse.move((panel?.x ?? 0) + 40, (panel?.y ?? 0) + 200);
  await page.mouse.down();
  await page.mouse.move(8, 8);
  await page.mouse.up();
  await expect(sheet(page)).toBeVisible();

  await page.mouse.click(8, 8);
  await expect(sheet(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/u);
  await expect(link(page, last)).toBeFocused();

  await link(page, last).click();
  await expect(sheet(page)).toBeVisible();
  await bar(page).getByRole("button", { name: CLOSE_LABEL }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(link(page, last)).toBeFocused();
});

test("the sheet's settings panel opens inside it, Escape closes the panel first and the sheet next", async () => {
  const { page } = screen;
  const target = ids[2] ?? 0;
  await page.setViewportSize({ width: 1440, height: 900 });
  await showGrid(page, "sheet", `/items/${target}`);
  await expect(sheet(page)).toBeVisible();

  await bar(page).getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Settings" })).toHaveCount(0);
  await expect(sheet(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
  await expect(link(page, target)).toBeFocused();
});

test("browser Back closes the Sheet with focus on the card last shown, Forward reopens it, and closing leaves no entry behind", async () => {
  const { page } = screen;
  const [first = 0, second = 0] = ids;
  await page.setViewportSize({ width: 1440, height: 900 });
  await showGrid(page, "sheet");
  await link(page, first).click();
  await expect(sheet(page)).toBeVisible();
  await page.getByRole("button", { name: NEXT_ITEM }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${second}$`, "u"));

  await page.goBack();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/u);
  await expect(link(page, second)).toBeFocused();

  await page.goForward();
  await expect(sheet(page)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/items/${second}$`, "u"));
  await expect(reader(page).locator(".rd-title")).toHaveText("Card number 2");

  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
  await expect(link(page, second)).toBeFocused();
  await page.goForward();
  await expect(sheet(page)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/items/${second}$`, "u"));
});

test("closing an Item opened by its address replaces that entry, so Back does not reopen it", async () => {
  const { page } = screen;
  const target = ids[3] ?? 0;
  await page.setViewportSize({ width: 1440, height: 900 });
  await showGrid(page, "sheet", `/items/${target}`);
  await expect(sheet(page)).toBeVisible();

  const entries = await page.evaluate(() => history.length);
  await bar(page).getByRole("button", { name: CLOSE_LABEL }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(link(page, target)).toBeFocused();
  expect(await page.evaluate(() => history.length), "closing added no history entry").toBe(entries);

  await page.goBack();
  expect(page.url(), "Back went to the page before, not the closed Item").not.toContain("/items/");
  await expect(sheet(page)).toHaveCount(0);
});
