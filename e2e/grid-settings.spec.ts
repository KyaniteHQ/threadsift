import { type Locator, type Page, expect, test } from "@playwright/test";

import { newCode, newPassword } from "./access.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { CARDS, seedCards } from "./grid.ts";
import { DESKTOP, app, expectChosen, openPanel, pickOption, storedSettings } from "./look.ts";

let screen: FreshScreen;

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
  seedCards(screen);
  await screen.page.setViewportSize(DESKTOP);
  await screen.page.goto("/");
  await expect(screen.page.locator("article.it")).toHaveCount(CARDS);
});

test.afterEach(async () => {
  await screen.close();
});

function openAsRow(dialog: Locator): Locator {
  return dialog.getByRole("radiogroup", { name: "Open items as" });
}

async function chooseGridAsSheet(page: Page): Promise<Locator> {
  const dialog = await openPanel(page);
  await pickOption(dialog, "Layout", "Grid");
  await pickOption(dialog, "Open items as", "Sheet");

  return dialog;
}

test("Open items as shows only in Grid, and choosing Grid and Sheet sets the root's layout and reader", async () => {
  const { page } = screen;
  const dialog = await openPanel(page);
  await expectChosen(dialog, "Layout", "List");
  await expect(openAsRow(dialog)).toHaveCount(0);
  await expect(app(page)).toHaveAttribute("data-reader", "pane");

  await pickOption(dialog, "Layout", "Grid");
  await expect(app(page)).toHaveAttribute("data-layout", "grid");
  await expect(app(page)).toHaveAttribute("data-reader", "page");
  await expectChosen(dialog, "Open items as", "Page");
  await expect(openAsRow(dialog)).not.toHaveAttribute("aria-disabled", "true");

  await pickOption(dialog, "Open items as", "Sheet");
  await expect(app(page)).toHaveAttribute("data-reader", "sheet");

  await pickOption(dialog, "Layout", "List");
  await expect(app(page)).toHaveAttribute("data-reader", "pane");
  await expect(openAsRow(dialog)).toHaveCount(0);
});

test("Layout and Open items as survive a reload, and Reset look leaves them alone", async () => {
  const { page } = screen;
  const dialog = await chooseGridAsSheet(page);
  await pickOption(dialog, "Text size", "Large");
  await expect(app(page)).toHaveAttribute("data-size", "large");

  await dialog.getByRole("button", { name: "Reset look" }).click();
  await expect(app(page)).toHaveAttribute("data-size", "medium");
  await expect(app(page)).toHaveAttribute("data-layout", "grid");
  await expect(app(page)).toHaveAttribute("data-open-as", "sheet");

  await page.reload();
  await expect(page.locator("article.it")).toHaveCount(CARDS);
  await expect(app(page)).toHaveAttribute("data-layout", "grid");
  await expect(app(page)).toHaveAttribute("data-open-as", "sheet");
  expect(await storedSettings(page)).toMatchObject({ layout: "grid", openAs: "sheet" });
  await expectChosen(await openPanel(page), "Open items as", "Sheet");
});
