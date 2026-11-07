import { type Page, expect, test } from "@playwright/test";

import { BACK_LONG, MARK_READ } from "../web/src/reader-text.ts";
import { SEARCH_LABEL } from "../web/src/text.ts";
import { newCode, newPassword } from "./access.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { pasteField } from "./links.ts";
import { DESKTOP } from "./look.ts";
import {
  bar,
  openLibrary,
  openRow,
  paragraphs,
  readStateOf,
  reader,
  row,
  seedRows,
} from "./reader.ts";

const ROWS = 12;
const PHONE = 390;
const NARROW = 600;
const SIDE_BY_SIDE = 800;

let screen: FreshScreen;
let ids: readonly number[];

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());

  ids = seedRows(
    screen,
    Array.from({ length: ROWS }, (_, index) => ({
      url: `https://example.com/item-${index + 1}`,
      title: `Item number ${index + 1}`,
      postText: `${paragraphs(40, `Item ${index + 1}`)}\n\n[Inside link ${index + 1}](https://example.com/inside-${index + 1})`,
    })),
  );
});

test.afterEach(async () => {
  await screen.close();
});

function searchbox(page: Page) {
  return page.getByRole("searchbox", { name: SEARCH_LABEL });
}

function openId(page: Page): number {
  return Number(new URL(page.url()).pathname.split("/").at(-1));
}

test("j, k, Enter, / and Escape work with the hints shown, and no key fires while typing in a field", async () => {
  const { page } = screen;
  const [first = 0, second = 0, third = 0] = ids;
  await openLibrary(page, DESKTOP.width, "/", ROWS);
  await row(page, first).locator("a.it-open").focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/items/${first}$`, "u"));
  await expect(bar(page).locator(".rd-hint")).toBeVisible();
  await expect(page.locator(".search .list-hint")).toHaveCount(0);

  await page.keyboard.press("j");
  await expect(page).toHaveURL(new RegExp(`/items/${second}$`, "u"));
  await expect(page.locator(".it.open")).toHaveAttribute("data-key", String(second));
  await page.keyboard.press("j");
  await expect(page).toHaveURL(new RegExp(`/items/${third}$`, "u"));
  await page.keyboard.press("k");
  await expect(page).toHaveURL(new RegExp(`/items/${second}$`, "u"));
  await expect(row(page, second).locator("a.it-open")).toBeFocused();

  await page.keyboard.press("/");
  await expect(searchbox(page)).toBeFocused();
  await page.keyboard.type("jkm Enter");
  await expect(searchbox(page)).toHaveValue("jkm Enter");
  await page.keyboard.press("Enter");
  expect(openId(page), "typing j, k, m and Enter in the search field").toBe(second);
  expect(await readStateOf(page, second)).toBe("unread");

  await pasteField(page).focus();
  await page.keyboard.type("jkm/");
  await expect(pasteField(page)).toHaveValue("jkm/");
  expect(openId(page)).toBe(second);
  expect(await readStateOf(page, second)).toBe("unread");

  await searchbox(page).fill("");
  await searchbox(page).focus();
  await page.keyboard.press("Escape");
  await expect(searchbox(page)).not.toBeFocused();
  await expect(reader(page)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(reader(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/u);
  await expect(row(page, second).locator("a.it-open")).toBeFocused();
});

test("the key hint moves from the reader bar to the list when the bar has no room for it", async () => {
  const { page } = screen;
  const [first = 0] = ids;
  await openLibrary(page, DESKTOP.width, `/items/${first}`, ROWS);
  await expect(bar(page).locator(".rd-hint")).toBeVisible();
  await expect(page.locator(".search .list-hint")).toHaveCount(0);

  await page.setViewportSize({ width: SIDE_BY_SIDE, height: DESKTOP.height });
  await expect(bar(page).locator(".rd-hint")).toBeHidden();
  await expect(page.locator(".search .list-hint")).toBeVisible();

  await page.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
  await expect(bar(page).locator(".rd-hint")).toBeVisible();
  await expect(page.locator(".search .list-hint")).toHaveCount(0);
});

const MID_RESIZE_ROUNDS = 30;

test("a font event between narrowing and widening the pane inside one frame leaves the bar fitted to the width it ends at", async () => {
  const { page } = screen;
  const [first = 0] = ids;
  await openLibrary(page, DESKTOP.width, `/items/${first}`, ROWS);
  await expect(bar(page).locator(".rd-hint")).toBeVisible();

  for (let round = 0; round < MID_RESIZE_ROUNDS; round += 1) {
    await page.setViewportSize({ width: SIDE_BY_SIDE, height: DESKTOP.height });
    await page.evaluate(() => {
      document.fonts.dispatchEvent(new Event("loadingdone"));
    });
    await page.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
    await expect(bar(page).locator(".rd-hint"), `round ${round}`).toBeVisible();
  }
});

test("j and k from a Reader button or a post-text link keep the focus in the Reader, on the new Item's title", async () => {
  const { page } = screen;
  const [first = 0, second = 0] = ids;
  await openLibrary(page, DESKTOP.width, "/", ROWS);
  await openRow(page, first);
  await expect(page.locator(".md")).toContainText("Item 1 paragraph 40");

  await bar(page).getByRole("button", { name: MARK_READ }).focus();
  await page.keyboard.press("j");
  await expect(page).toHaveURL(new RegExp(`/items/${second}$`, "u"));
  await expect(reader(page).locator(".rd-title")).toHaveText("Item number 2");
  await expect(reader(page).locator(".rd-title")).toBeFocused();

  await expect(page.locator(".md")).toContainText("Item 2 paragraph 40");
  await page.locator(".md a.il-a").focus();
  await page.keyboard.press("k");
  await expect(page).toHaveURL(new RegExp(`/items/${first}$`, "u"));
  await expect(reader(page).locator(".rd-title")).toHaveText("Item number 1");
  await expect(reader(page).locator(".rd-title")).toBeFocused();

  await row(page, second).locator("a.it-open").focus();
  await page.keyboard.press("j");
  await expect(page).toHaveURL(new RegExp(`/items/${second}$`, "u"));
  await expect(row(page, second).locator("a.it-open")).toBeFocused();
});

function coversTheScreen(width: number, backs: string): void {
  test(`at ${width}px the Reader fills the screen and its back control (${backs}) returns to the list at the same row`, async () => {
    const { page } = screen;
    const target = ids[ROWS - 3] ?? 0;
    await openLibrary(page, width, "/", ROWS);
    await row(page, target).scrollIntoViewIfNeeded();
    const before = await row(page, target).boundingBox();
    await openRow(page, target);

    const box = await reader(page).boundingBox();
    expect(box?.x, "the Reader starts at the left edge").toBe(0);
    expect(box?.width, "the Reader is as wide as the screen").toBe(width);
    await expect(page.locator(".bg")).toHaveJSProperty("inert", true);

    const back = bar(page).getByRole("button", { name: BACK_LONG });
    await expect(back).toBeVisible();
    await back.click();
    await expect(reader(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/u);
    await expect(row(page, target).locator("a.it-open")).toBeFocused();
    const after = await row(page, target).boundingBox();
    expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0)), "the row's place on screen").toBeLessThan(
      2,
    );
  });
}

for (const [width, backs] of [
  [PHONE, "an icon"],
  [NARROW, "its label"],
] as const) {
  coversTheScreen(width, backs);
}
