import { expect, test } from "@playwright/test";

import { BACK_TO_GRID } from "../web/src/reader-text.ts";
import { FILTER_GROUPS, OPEN_AS_NARROW_NOTE, SOURCE_LABELS } from "../web/src/text.ts";
import { newCode, newPassword } from "./access.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import {
  BAND_COLUMNS,
  CARDS,
  PAGE_MAX,
  columnsOf,
  expectInView,
  link,
  seedCards,
  showGrid,
} from "./grid.ts";
import { afterTwoFrames, viewportAt } from "./look.ts";
import { bar, reader, row } from "./reader.ts";

let screen: FreshScreen;
let ids: readonly number[];

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

test.beforeAll(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
  ids = seedCards(screen);
});

test.afterAll(async () => {
  await screen.close();
});

test("the grid shows 4, 3, 3, 2 and 1 columns on each side of every band edge, centred and at most 1480 px wide", async () => {
  const { page } = screen;
  await showGrid(page, "page");
  await expect(page.locator("article.it")).toHaveCount(CARDS);

  for (const { width, columns } of BAND_COLUMNS) {
    await viewportAt(page, width);
    await expect.poll(() => columnsOf(page), { message: `${width}px` }).toBe(columns);
  }

  await viewportAt(page, 1920);
  await expect.poll(() => columnsOf(page)).toBe(4);
  const box = await page.locator(".items").boundingBox();
  expect(box?.width, "the grid is at most the page maximum wide").toBeLessThanOrEqual(PAGE_MAX);
  expect(box?.x, "the grid sits in the middle").toBeCloseTo(
    1920 - ((box?.x ?? 0) + (box?.width ?? 0)),
    0,
  );
});

test("a card opens the Reader as a full page, and Back returns to the same card in view", async () => {
  const { page } = screen;
  const target = ids.at(-2) ?? 0;
  await page.setViewportSize({ width: 1440, height: 420 });
  await showGrid(page, "page");
  await expect(page.locator("article.it")).toHaveCount(CARDS);
  await link(page, target).scrollIntoViewIfNeeded();
  const before = await row(page, target).boundingBox();
  expect(before?.y ?? 0, "the card was scrolled to").toBeGreaterThan(0);
  const scrolled = await page.locator(".lib").evaluate((lib) => lib.scrollTop);
  expect(scrolled, "the grid scrolled to reach the card").toBeGreaterThan(0);

  await link(page, target).click();
  await expect(reader(page)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/items/${target}$`, "u"));
  expect(await reader(page).boundingBox(), "the Reader covers the window").toMatchObject({
    x: 0,
    width: 1440,
  });
  await expect(page.locator(".bg")).toHaveJSProperty("inert", true);
  await expect(page.locator("dialog.sheet")).toHaveCount(0);

  await bar(page).getByRole("button", { name: BACK_TO_GRID }).click();
  await expect(reader(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/u);
  await expect(link(page, target)).toBeFocused();
  await expectInView(page, row(page, target));
  const after = await row(page, target).boundingBox();
  expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0)), "the card's place on screen").toBeLessThan(
    2,
  );
});

test("in Page the arrow keys step through the shown Items in grid order, and j or k with nothing open only move focus between cards", async () => {
  const { page } = screen;
  const [first = 0, second = 0, third = 0] = ids;
  await viewportAt(page, 1440);
  await showGrid(page, "page");
  await expect(page.locator("article.it")).toHaveCount(CARDS);

  await link(page, first).focus();
  await page.keyboard.press("j");
  await expect(link(page, second)).toBeFocused();
  await expect(reader(page)).toHaveCount(0);
  await page.keyboard.press("k");
  await expect(link(page, first)).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/items/${first}$`, "u"));
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(new RegExp(`/items/${second}$`, "u"));
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(new RegExp(`/items/${third}$`, "u"));
  await page.keyboard.press("ArrowLeft");
  await expect(page).toHaveURL(new RegExp(`/items/${second}$`, "u"));
  await page.keyboard.press("Escape");
  await expect(reader(page)).toHaveCount(0);
  await expect(link(page, second)).toBeFocused();
});

test("the filter bar narrows the grid with chips and selects, and a Sheet or Page steps only through what is shown", async () => {
  const { page } = screen;
  await viewportAt(page, 1440);
  await showGrid(page, "page");
  await expect(page.locator("article.it")).toHaveCount(CARDS);

  const sources = page.getByRole("group", { name: FILTER_GROUPS.source });
  await sources.getByRole("button", { name: new RegExp(SOURCE_LABELS.reddit, "u") }).click();
  await expect(page.locator("article.it")).toHaveCount(CARDS / 2);

  const shown = await page
    .locator("article.it")
    .evaluateAll((cards) => cards.map((card) => Number(card.dataset["key"])));

  expect(shown, "every other card is a Reddit card").toEqual(
    ids.filter((_, index) => index % 2 === 0),
  );

  const topic = page.getByRole("combobox", { name: FILTER_GROUPS.topic });
  await topic.selectOption({ label: "Reading (7)" });
  await expect(page.locator("article.it")).toHaveCount(CARDS / 2);
  await topic.selectOption({ label: "Writing (0)" });
  await expect(page.locator("article.it")).toHaveCount(0);
  await topic.selectOption({ index: 0 });

  const [first = 0, second = 0] = shown;
  await link(page, first).click();
  await expect(page).toHaveURL(new RegExp(`/items/${first}$`, "u"));
  await expect(reader(page)).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(new RegExp(`/items/${second}$`, "u"));
});

test("under 760 px a card opens a full page whatever Open items as says, and the row is disabled with its note", async () => {
  const { page } = screen;
  const target = ids[1] ?? 0;

  for (const width of [600, 390]) {
    await viewportAt(page, width);
    await showGrid(page, "sheet");
    await expect(page.locator("article.it")).toHaveCount(CARDS);
    await link(page, target).click();
    await expect(reader(page)).toBeVisible();
    await expect(page.locator("dialog.sheet")).toHaveCount(0);
    expect(
      await reader(page).boundingBox(),
      `the Reader fills the ${width}px window`,
    ).toMatchObject({
      x: 0,
      width,
    });
    await expect(bar(page).getByRole("button", { name: BACK_TO_GRID })).toBeVisible();
    await bar(page).getByRole("button", { name: BACK_TO_GRID }).click();
    await expect(reader(page)).toHaveCount(0);
    await expect(link(page, target)).toBeFocused();
  }

  await viewportAt(page, 600);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const openAs = page.getByRole("radiogroup", { name: "Open items as" });
  await expect(openAs).toHaveAttribute("aria-disabled", "true");
  await expect(openAs.getByRole("radio", { name: "Sheet" })).toBeDisabled();
  await expect(openAs).toHaveAccessibleDescription(OPEN_AS_NARROW_NOTE);
  await expect(page.getByText(OPEN_AS_NARROW_NOTE)).toBeVisible();
  await afterTwoFrames(page);
});
