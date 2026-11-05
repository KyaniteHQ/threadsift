import { type Page, expect, test } from "@playwright/test";

import { LOGIN, SETUP, WAIT } from "../web/src/access-text.ts";
import { newCode, newPassword } from "./access.ts";
import { type FreshScreen, lockFor, openFresh, setUpByApi } from "./fresh-screen.ts";
import { codeField, confirmField, passwordField } from "./setup-screens.ts";

const PASSWORD_LENGTH = 15;
const LOCK_MS = 5000;
const COUNTDOWN_MS = 4000;
const OVER_MS = 9000;

let screen: FreshScreen;
const code = newCode();
const password = newPassword().slice(0, PASSWORD_LENGTH);

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  screen = await openFresh(browser, code);
});

test.afterAll(async () => {
  await screen.close();
});

function alertOf(page: Page) {
  return page.getByRole("alert");
}

test("setup: a wrong code and a short password are announced, tied to their field, and the help gives way to the error", async () => {
  const { page } = screen;
  await page.goto("/");
  await codeField(page).fill(`${code}x`);
  await codeField(page).press("Enter");
  await expect(alertOf(page)).toHaveText(SETUP.codeWrong);
  await expect(codeField(page)).toBeFocused();
  await expect(codeField(page)).toHaveAccessibleDescription(SETUP.codeWrong);

  await codeField(page).fill(code);
  await codeField(page).press("Enter");
  await passwordField(page).fill("short");
  await confirmField(page).fill("short");
  await passwordField(page).press("Enter");
  await expect(alertOf(page)).toHaveText(SETUP.passwordTooShort);
  await expect(passwordField(page)).toBeFocused();
  await expect(page.getByText(SETUP.passwordHelp)).toHaveCount(0);
  await expect(passwordField(page)).toHaveAccessibleDescription(SETUP.passwordTooShort);
});

test("sign-in: a wrong password is announced, and a lock counts down and says when it ends", async () => {
  const { page, fresh } = screen;
  await setUpByApi(fresh, code, password);
  await page.goto("/");
  await passwordField(page).fill(`${password}x`);
  await passwordField(page).press("Enter");
  await expect(alertOf(page)).toHaveText(LOGIN.wrong);
  await expect(passwordField(page)).toBeFocused();

  lockFor(fresh, "login", LOCK_MS);
  await passwordField(page).fill(password);
  await passwordField(page).press("Enter");
  await expect(alertOf(page)).toHaveText(/wait [3-5] seconds/u);
  await expect(alertOf(page)).toHaveText(/wait [1-3] seconds/u, { timeout: COUNTDOWN_MS });
  await expect(alertOf(page)).toHaveText(WAIT.over, { timeout: OVER_MS });
  await expect(page.getByRole("button", { name: LOGIN.signIn })).not.toHaveAttribute(
    "aria-disabled",
    "true",
  );

  await passwordField(page).fill(password);
  await passwordField(page).press("Enter");
  await expect(page.getByRole("textbox", { name: "Paste a link to save" })).toBeVisible();
});
