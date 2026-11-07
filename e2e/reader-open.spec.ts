import { expect, test } from "@playwright/test";

import { PASTE_OPEN } from "../web/src/reader-text.ts";
import { NOTICES } from "../web/src/text.ts";
import { newCode, newPassword } from "./access.ts";
import { ADDED, REFRESHED, cardTitle, pasteOnly } from "./card.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { newRunId, pasteCard, titledPage } from "./links.ts";
import { DESKTOP, viewportAt } from "./look.ts";
import { openLibrary, openRow, reader, row, seedRows } from "./reader.ts";

let screen: FreshScreen;

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
});

test.afterEach(async () => {
  await screen.close();
});

test("a Link-only Item's Reader header shows the last fetch result note", async () => {
  const { page } = screen;

  const [linkOnly = 0] = seedRows(screen, [
    {
      url: "https://example.com/gone",
      title: null,
      source: "other",
      kind: "link",
      fetchResult: "status",
    },
  ]);

  await openLibrary(page, DESKTOP.width, "/", 1);
  await openRow(page, linkOnly);
  await expect(reader(page).locator(".rd-title")).toHaveText("example.com/gone");
  await expect(reader(page).locator(".rd-head .rd-note")).toHaveText(NOTICES.status.text);
  await expect(reader(page).locator(".rd-agent")).toHaveCount(0);
  await expect(row(page, linkOnly)).toHaveClass(/\bopen\b/u);
});

test("the paste card's Added and Already saved, refreshed states have an Open button that opens the Item in the Reader", async () => {
  const { page } = screen;
  const run = newRunId();
  const url = titledPage(`Open from the card ${run}`);
  await viewportAt(page, DESKTOP.width);
  await page.goto("/");

  await pasteOnly(page, url);
  await expect(cardTitle(page)).toHaveText(ADDED);
  await pasteCard(page).getByRole("button", { name: PASTE_OPEN }).click();
  await expect(reader(page)).toBeVisible();
  await expect(reader(page).locator(".rd-title")).toHaveText(`Open from the card ${run}`);
  await expect(pasteCard(page)).toBeHidden();
  const opened = new URL(page.url()).pathname;

  await page.keyboard.press("Escape");
  await expect(reader(page)).toHaveCount(0);
  await pasteOnly(page, url);
  await expect(cardTitle(page)).toHaveText(REFRESHED);
  await pasteCard(page).getByRole("button", { name: PASTE_OPEN }).click();
  await expect(reader(page)).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(opened);
});
