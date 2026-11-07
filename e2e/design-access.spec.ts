import { type BrowserContext, type Page, expect, test } from "@playwright/test";

import { FIELDS, LOGIN, PASSWORD, RESET, SETTINGS, SETUP } from "../web/src/access-text.ts";
import { type Instance, launchFresh, newCode, minimumPassword, newPassword } from "./access.ts";
import { THEMES, checkAtEveryWidth } from "./design-screens.ts";
import { storeSettings } from "./look.ts";
import { fillChange, newResetCode, passwordSection, resetEnv } from "./password.ts";
import {
  enterCode,
  libraryHeading,
  passwordField,
  setUpInBrowser,
  submitPassword,
  tokenNameField,
} from "./setup-screens.ts";

const TEST_TIMEOUT_MS = 180_000;

let fresh: Instance;
let context: BrowserContext;
let page: Page;
const code = newCode();
const resetCode = newResetCode();
let password = minimumPassword();

test.describe.configure({ mode: "serial", timeout: TEST_TIMEOUT_MS });

test.beforeAll(async ({ browser }) => {
  fresh = launchFresh(code, resetEnv(resetCode));
  context = await browser.newContext({ baseURL: fresh.url });
  page = await context.newPage();
});

test.afterAll(async () => {
  await context.close();
  fresh.stop();
});

async function expectMessage(text: string): Promise<void> {
  await expect(page.getByText(text, { exact: true })).toBeVisible();
}

test("the setup screens keep the design rules at every width in every theme", async () => {
  for (const theme of THEMES) {
    await storeSettings(page, { theme });
    await expect(page.getByRole("heading", { name: SETUP.codeTitle })).toBeVisible();
    await checkAtEveryWidth(page, `setup code step, ${theme}`);

    await enterCode(page, `${code}x`);
    await expectMessage(SETUP.codeWrong);
    await checkAtEveryWidth(page, `setup code step with an error, ${theme}`);

    await enterCode(page, code);
    await expect(page.getByRole("heading", { name: SETUP.passwordTitle })).toBeVisible();
    await checkAtEveryWidth(page, `setup password step, ${theme}`);

    await submitPassword(page, password, `${password}x`);
    await expectMessage(SETUP.passwordMismatch);
    await checkAtEveryWidth(page, `setup password step with an error, ${theme}`);
  }
});

test("the login screen keeps the design rules at every width in every theme", async () => {
  await setUpInBrowser(page, code, password);
  await page.goto("/settings");
  await page.getByRole("button", { name: SETTINGS.signOut }).click();

  for (const theme of THEMES) {
    await storeSettings(page, { theme });
    await expect(page.getByRole("heading", { name: LOGIN.heading })).toBeVisible();
    await checkAtEveryWidth(page, `login, ${theme}`);

    await passwordField(page).fill(`${password}x`);
    await page.getByRole("button", { name: LOGIN.signIn }).click();
    await expectMessage(LOGIN.wrong);
    await checkAtEveryWidth(page, `login with an error, ${theme}`);
  }
});

test("the tokens screen keeps the design rules at every width in every theme", async () => {
  await passwordField(page).fill(password);
  await page.getByRole("button", { name: LOGIN.signIn }).click();
  await expect(libraryHeading(page)).toBeVisible();

  for (const theme of THEMES) {
    await storeSettings(page, { theme }, "/settings");
    await expect(page.getByRole("heading", { name: SETTINGS.title })).toBeVisible();

    await checkAtEveryWidth(page, `tokens, no token yet, ${theme}`);

    await tokenNameField(page).fill(`Extension ${theme}`);
    await page.getByRole("button", { name: SETTINGS.createToken }).click();
    await expect(page.getByLabel(SETTINGS.tokenValue)).toBeVisible();
    await checkAtEveryWidth(page, `token shown once, ${theme}`);

    await page.getByRole("button", { name: SETTINGS.done }).click();
    await checkAtEveryWidth(page, `tokens listed, ${theme}`);

    await page.getByRole("button", { name: SETTINGS.revoke }).first().click();
    await expect(page.getByRole("button", { name: SETTINGS.revokeConfirm })).toBeVisible();
    await checkAtEveryWidth(page, `revoke question, ${theme}`);
    await page.getByRole("button", { name: SETTINGS.cancel }).click();

    await page.getByRole("button", { name: SETTINGS.revoke }).first().click();
    await page.getByRole("button", { name: SETTINGS.revokeConfirm }).click();
    await expect(page.getByRole("button", { name: SETTINGS.revoke })).toHaveCount(0);
  }
});

test("the password section keeps the design rules at every width in every theme", async () => {
  for (const theme of THEMES) {
    await storeSettings(page, { theme }, "/settings");
    await expect(page.getByRole("heading", { name: SETTINGS.title })).toBeVisible();
    await checkAtEveryWidth(page, `password section, empty, ${theme}`);

    await fillChange(page, `${password}x`, newPassword());
    await expect(passwordSection(page).getByText(PASSWORD.currentWrong)).toBeVisible();
    await checkAtEveryWidth(page, `password section, wrong current, ${theme}`);

    const next = newPassword();
    await fillChange(page, password, next);
    await expect(passwordSection(page).getByRole("status")).toHaveText(PASSWORD.changed);
    password = next;
    await checkAtEveryWidth(page, `password section, changed, ${theme}`);
  }
});

test("the reset screen keeps the design rules at every width in every theme", async () => {
  await page.goto("/settings");
  await page.getByRole("button", { name: SETTINGS.signOut }).click();

  for (const theme of THEMES) {
    await storeSettings(page, { theme }, "/reset");
    await expect(page.getByRole("heading", { name: RESET.heading })).toBeVisible();
    await checkAtEveryWidth(page, `reset screen, instructions, ${theme}`);

    await page.getByLabel(RESET.codeLabel, { exact: true }).fill(`${resetCode}x`);
    await passwordField(page).fill(password);
    await page.getByLabel(FIELDS.confirmPassword, { exact: true }).fill(password);
    await page.getByRole("button", { name: RESET.button }).click();
    await expectMessage(RESET.codeWrong);
    await checkAtEveryWidth(page, `reset screen, wrong code, ${theme}`);
  }
});
