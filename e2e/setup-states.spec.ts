import { type Page, expect, test } from "@playwright/test";

import { LOGIN, SETUP, WAIT } from "../web/src/access-text.ts";
import { newCode, newPassword } from "./access.ts";
import { type FreshScreen, lockFor, openFresh, setUpByApi } from "./fresh-screen.ts";
import { codeField, confirmField, enterCode, passwordField } from "./setup-screens.ts";

const PASSWORD_LENGTH = 15;
const LOCK_MS = 5000;
const COUNTDOWN_MS = 4000;
const OVER_MS = 9000;

const code = newCode();
const password = newPassword().slice(0, PASSWORD_LENGTH);

let screen: FreshScreen;

test.beforeEach(async ({ browser }) => {
  screen = await openFresh(browser, code);
});

test.afterEach(async () => {
  await screen.close();
});

function signInHeading(page: Page) {
  return page.getByRole("heading", { level: 1, name: LOGIN.heading });
}

test("the code step finds out that an owner exists when the code is sent, and shows sign-in", async () => {
  const { page, fresh } = screen;
  await page.goto("/");
  await expect(codeField(page)).toBeFocused();

  await setUpByApi(fresh, code, password);
  await enterCode(page, code);

  await expect(signInHeading(page)).toBeVisible();
  await expect(passwordField(page)).toBeFocused();
});

test("the password step finds out that an owner exists when the password is sent, and shows sign-in", async () => {
  const { page, fresh } = screen;
  await page.goto("/");
  await enterCode(page, code);
  await expect(passwordField(page)).toBeFocused();

  await setUpByApi(fresh, code, password);
  await passwordField(page).fill(password);
  await confirmField(page).fill(password);
  await page.getByRole("button", { name: SETUP.create }).click();

  await expect(signInHeading(page)).toBeVisible();
});

test("a locked code step counts down in the page, says when it ends and then accepts the code", async () => {
  const { page, fresh } = screen;
  await page.goto("/");
  lockFor(fresh, "setup", LOCK_MS);
  await enterCode(page, code);

  const alert = page.getByRole("alert");
  await expect(alert).toHaveText(/wait [3-5] seconds/u);
  await expect(alert).toHaveText(/wait [1-3] seconds/u, { timeout: COUNTDOWN_MS });
  await expect(alert).toHaveText(WAIT.over, { timeout: OVER_MS });

  await page.getByRole("button", { name: SETUP.continue }).click();
  await expect(passwordField(page)).toBeFocused();
});

test("a locked password step counts down in the page and ends", async () => {
  const { page, fresh } = screen;
  await page.goto("/");
  await enterCode(page, code);
  await expect(passwordField(page)).toBeFocused();

  lockFor(fresh, "setup", LOCK_MS);
  await passwordField(page).fill(password);
  await confirmField(page).fill(password);
  await page.getByRole("button", { name: SETUP.create }).click();

  const alert = page.getByRole("alert");
  await expect(alert).toHaveText(/wait [3-5] seconds/u);
  await expect(alert).toHaveText(WAIT.over, { timeout: OVER_MS });
});
