import { type Page, expect, test } from "@playwright/test";

import { SETTINGS } from "../web/src/access-text.ts";
import { newCode, newPassword } from "./access.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";

const PASSWORD_LENGTH = 15;
const NAME_LIMIT = 80;
const TOO_LONG = NAME_LIMIT + 27;
const PIXEL = 1;

let screen: FreshScreen;
const code = newCode();
const password = newPassword().slice(0, PASSWORD_LENGTH);

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  screen = await openSignedIn(browser, code, password);
});

test.afterAll(async () => {
  await screen.close();
});

function nameField(page: Page) {
  return page.getByLabel(SETTINGS.tokenName);
}

function createButton(page: Page) {
  return page.getByRole("button", { name: SETTINGS.createToken });
}

async function centreOf(box: Promise<{ y: number; height: number } | null>): Promise<number> {
  const found = await box;
  expect(found).not.toBeNull();

  return (found?.y ?? 0) + (found?.height ?? 0) / 2;
}

test("the token name stops at 80 characters, and a name the server refuses says why", async () => {
  const { page } = screen;
  await page.goto("/settings");
  await expect(nameField(page)).toHaveAttribute("maxlength", String(NAME_LIMIT));
  await nameField(page).pressSequentially("n".repeat(TOO_LONG));
  await expect(nameField(page)).toHaveValue("n".repeat(NAME_LIMIT));

  await nameField(page).evaluate((input) => {
    input.removeAttribute("maxlength");
  });
  await nameField(page).fill("n".repeat(TOO_LONG));
  await nameField(page).press("Enter");
  await expect(page.getByRole("alert")).toHaveText(SETTINGS.tokenNameTooLong);
  await expect(nameField(page)).toBeFocused();
});

test("Create stays level with the name field while the field shows an error", async () => {
  const { page } = screen;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/settings");
  const quiet = await centreOf(createButton(page).boundingBox());
  const input = await centreOf(nameField(page).boundingBox());
  expect(Math.abs(quiet - input), "Create is level with the field").toBeLessThan(PIXEL);

  await nameField(page).press("Enter");
  await expect(page.getByRole("alert")).toHaveText(SETTINGS.tokenNameRequired);
  const withError = await centreOf(createButton(page).boundingBox());
  const inputWithError = await centreOf(nameField(page).boundingBox());
  expect(Math.abs(withError - inputWithError), "Create stays level").toBeLessThan(PIXEL);
});
