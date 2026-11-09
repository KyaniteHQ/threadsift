import { expect, test } from "@playwright/test";

import { newCode, newPassword } from "./access.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { DESKTOP, afterTwoFrames, openPanel, pickOption } from "./look.ts";
import {
  leaveFirstForTallAsSoonAsItIsShown,
  scrollAndSettle,
  scrollOf,
  sharePlace,
  topBlock,
} from "./reader-place.ts";
import { openLibrary, openRow, paragraphs, rewritePostText, seedRows, slot } from "./reader.ts";

const ROWS = 3;
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
      postText: paragraphs(40, `Item ${index + 1}`),
    })),
  );
});

test.afterEach(async () => {
  await screen.close();
});

test("the open Item and its scroll place come back after a reload, and a second tab keeps its own place", async () => {
  const { page, context } = screen;
  const [first = 0] = ids;
  await openLibrary(page, DESKTOP.width, "/", ROWS);
  await openRow(page, first);
  await expect(page.locator(".md")).toContainText("Item 1 paragraph 40");
  const half = await scrollAndSettle(page, first, 0.5);

  const other = await context.newPage();
  await openLibrary(other, DESKTOP.width, `/items/${first}`, ROWS);
  await expect(other.locator(".md")).toContainText("Item 1 paragraph 40");
  expect(
    await slot(other).evaluate((element) => element.scrollTop),
    "a new tab starts at the top",
  ).toBe(0);
  const fifth = await scrollAndSettle(other, first, 0.2);
  expect(fifth).not.toBe(half);

  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/items/${first}$`, "u"));
  await expect(page.locator(".md")).toContainText("Item 1 paragraph 40");
  await expect.poll(() => topBlock(page)).toBe(half);

  await other.reload();
  await expect(other.locator(".md")).toContainText("Item 1 paragraph 40");
  await expect.poll(() => topBlock(other)).toBe(fifth);
  await other.close();
});

test("a change of Text size or of the pane's width keeps the block at the top of the Reader", async () => {
  const { page } = screen;
  const [first = 0] = ids;
  await openLibrary(page, DESKTOP.width, "/", ROWS);
  await openRow(page, first);
  await expect(page.locator(".md")).toContainText("Item 1 paragraph 40");
  const half = await scrollAndSettle(page, first, 0.5);

  await pickOption(await openPanel(page), "Text size", "Large");
  await expect(page.locator("[data-size]").first()).toHaveAttribute("data-size", "large");
  await expect.poll(() => topBlock(page), { message: "after Text size Large" }).toBe(half);

  await page.setViewportSize({ width: SIDE_BY_SIDE + 100, height: DESKTOP.height });
  await expect.poll(() => topBlock(page), { message: "after a narrower pane" }).toBe(half);

  await page.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
  await expect.poll(() => topBlock(page), { message: "after a wider pane" }).toBe(half);
});

test("an Item left before its place settled is not moved by the old Item's pending restore", async () => {
  const { page } = screen;
  await page.clock.install();
  const [first = 0] = ids;

  const [tall = 0] = seedRows(screen, [
    {
      url: "https://example.com/tall-start",
      title: "Tall start",
      postText: `${"A long opening that takes many lines. ".repeat(60)}\n\n${paragraphs(40, "Tall")}`,
      savedAt: Date.now(),
    },
  ]);

  await openLibrary(page, DESKTOP.width, "/", ROWS + 1);
  const atFirst = await sharePlace(page, first, tall);
  await leaveFirstForTallAsSoonAsItIsShown(page, tall);

  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/items/${tall}$`, "u"));
  await expect(page.locator(".md")).toContainText("Tall paragraph 40");
  await expect.poll(() => scrollOf(page)).toBe(atFirst);
  const settled = await topBlock(page);

  await page.clock.fastForward(1_000);
  await afterTwoFrames(page);
  expect(await scrollOf(page)).toBe(atFirst);
  expect(await topBlock(page)).toBe(settled);
});

test("a saved place follows its passage when blocks are added before it, and gives way to the top when the passage is gone", async () => {
  const { page } = screen;
  const [first = 0] = ids;
  await openLibrary(page, DESKTOP.width, "/", ROWS);
  await openRow(page, first);
  await expect(page.locator(".md")).toContainText("Item 1 paragraph 40");
  const half = await scrollAndSettle(page, first, 0.5);

  rewritePostText(screen, first, `${paragraphs(6, "Added")}\n\n${paragraphs(40, "Item 1")}`);
  await page.reload();
  await expect(page.locator(".md")).toContainText("Added paragraph 6");
  await expect.poll(() => topBlock(page), { message: "after blocks were added" }).toBe(half);

  rewritePostText(screen, first, paragraphs(40, "Changed"));
  await page.reload();
  await expect(page.locator(".md")).toContainText("Changed paragraph 40");
  await expect.poll(() => scrollOf(page), { message: "after the passage was removed" }).toBe(0);
});
