import { expect, test } from "@playwright/test";

import { SETTINGS } from "../web/src/access-text.ts";
import { READER_PLACEHOLDER } from "../web/src/reader-text.ts";
import { newCode, newPassword } from "./access.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { pasteField } from "./links.ts";
import { DESKTOP, afterTwoFrames, viewportAt } from "./look.ts";
import { openLibrary, reader, readStateOf, row, seedRows } from "./reader.ts";

let screen: FreshScreen;
let ids: readonly number[];

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());

  ids = seedRows(screen, [
    { url: "https://example.com/already-read", title: "Already read", read: true },
    { url: "https://example.com/first-unread", title: "First unread" },
    { url: "https://example.com/second-unread", title: "Second unread" },
  ]);
});

test.afterEach(async () => {
  await screen.close();
});

test("the wide List opens the first unread Item by itself, leaves it unread, and Escape closes it for good", async () => {
  const { page } = screen;
  const [, firstUnread = 0, secondUnread = 0] = ids;
  await openLibrary(page, DESKTOP.width, "/", 3);

  await expect(page).toHaveURL(new RegExp(`/items/${firstUnread}$`, "u"));
  await expect(reader(page).locator(".rd-title")).toHaveText("First unread");
  await expect(row(page, firstUnread)).toHaveClass(/\bopen\b/u);
  await expect(row(page, secondUnread)).not.toHaveClass(/\bopen\b/u);
  expect(await readStateOf(page, firstUnread)).toBe("unread");

  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/$/u);
  await expect(reader(page)).toHaveCount(0);
  await afterTwoFrames(page);
  await expect(page).toHaveURL(/\/$/u);
});

test("opening by itself leaves the focus in the paste field", async () => {
  const { page } = screen;
  const [, firstUnread = 0] = ids;
  await viewportAt(page, DESKTOP.width);
  await page.goto("/settings");
  await page.getByRole("link", { name: SETTINGS.back }).click();

  await expect(page).toHaveURL(new RegExp(`/items/${firstUnread}$`, "u"));
  await expect(reader(page)).toBeVisible();
  await expect(pasteField(page)).toBeFocused();
});

test("an Item in the address wins over the first unread Item", async () => {
  const { page } = screen;
  const [alreadyRead = 0, firstUnread = 0] = ids;
  await openLibrary(page, DESKTOP.width, `/items/${alreadyRead}`, 3);

  await expect(reader(page).locator(".rd-title")).toHaveText("Already read");
  await expect(page).toHaveURL(new RegExp(`/items/${alreadyRead}$`, "u"));
  await expect(row(page, firstUnread)).not.toHaveClass(/\bopen\b/u);
});

function opensNothingAt(width: number): void {
  test(`at ${width}px the List shows the list first and opens nothing by itself`, async () => {
    const { page } = screen;
    await openLibrary(page, width, "/", 3);
    await afterTwoFrames(page);

    await expect(page).toHaveURL(/\/$/u);
    await expect(reader(page)).toHaveCount(0);
  });
}

for (const width of [390, 600]) {
  opensNothingAt(width);
}

test("a library with nothing unread opens nothing", async () => {
  const { page } = screen;
  screen.fresh.sql("UPDATE items SET read_state = 'read'");
  await openLibrary(page, DESKTOP.width, "/", 3);
  await afterTwoFrames(page);

  await expect(page).toHaveURL(/\/$/u);
  await expect(reader(page)).toHaveCount(0);
  await expect(page.locator(".reader-ph")).toContainText(READER_PLACEHOLDER);
});
