import { type Page, expect, test } from "@playwright/test";

import { LOGIN, SETTINGS } from "../web/src/access-text.ts";
import { newCode, newPassword } from "./access.ts";
import { type FreshScreen, openFresh, openSignedIn } from "./fresh-screen.ts";
import { passwordField, setUpInBrowser } from "./setup-screens.ts";

const PASSWORD_LENGTH = 15;

let screen: FreshScreen;
const code = newCode();
const password = newPassword().slice(0, PASSWORD_LENGTH);

function pasteField(page: Page) {
  return page.getByRole("textbox", { name: "Paste a link to save" });
}

test.describe("setup", () => {
  test.beforeAll(async ({ browser }) => {
    screen = await openFresh(browser, code);
  });

  test.afterAll(async () => {
    await screen.close();
  });

  test("setup lands on the library with the paste field focused", async () => {
    const { page } = screen;
    await setUpInBrowser(page, code, password);
    await expect(pasteField(page)).toBeFocused();
  });
});

test.describe("after setup", () => {
  test.beforeAll(async ({ browser }) => {
    screen = await openSignedIn(browser, code, password);
  });

  test.afterAll(async () => {
    await screen.close();
  });

  test("loading the library again does not take focus", async () => {
    const { page } = screen;
    await page.goto("/");
    await expect(pasteField(page)).toBeVisible();
    await expect(pasteField(page)).not.toBeFocused();
  });

  test("Back to library is a link to /, and a modified click leaves this tab alone", async () => {
    const { page, context } = screen;
    await page.goto("/settings");
    const back = page.getByRole("link", { name: SETTINGS.back });
    await expect(back).toHaveAttribute("href", "/");

    const opened = context.waitForEvent("page");
    await back.click({ modifiers: ["ControlOrMeta"] });
    const tab = await opened;
    await expect(tab).toHaveURL(/\/$/u);
    await tab.close();
    await expect(page).toHaveURL(/\/settings$/u);
  });

  test("Back to library lands on the library with the paste field focused", async () => {
    const { page } = screen;
    await page.goto("/settings");
    await page.getByRole("link", { name: SETTINGS.back }).click();
    await expect(pasteField(page)).toBeFocused();
  });

  test("signing in lands on the library with the paste field focused", async () => {
    const { page } = screen;
    await page.goto("/settings");
    await page.getByRole("button", { name: SETTINGS.signOut }).click();
    await passwordField(page).fill(password);
    await page.getByRole("button", { name: LOGIN.signIn }).click();
    await expect(pasteField(page)).toBeFocused();
  });
});
