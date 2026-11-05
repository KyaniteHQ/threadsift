import { type BrowserContext, type Page, expect, test } from "@playwright/test";

import { LOGIN, SETTINGS, SETUP } from "../web/src/access-text.ts";
import { type Instance, launchFresh, newCode, newPassword } from "./access.ts";
import { THEMES, checkAtEveryWidth } from "./design-screens.ts";
import { storeSettings } from "./look.ts";
import { confirmField, enterCode, passwordField, setUpInBrowser } from "./setup-screens.ts";

const PASSWORD_LENGTH = 15;
const TEST_TIMEOUT_MS = 180_000;

let fresh: Instance;
let context: BrowserContext;
let page: Page;
const code = newCode();
const password = newPassword().slice(0, PASSWORD_LENGTH);

test.describe.configure({ mode: "serial", timeout: TEST_TIMEOUT_MS });

test.beforeAll(async ({ browser }) => {
  fresh = launchFresh(code);
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

    await passwordField(page).fill(password);
    await confirmField(page).fill(`${password}x`);
    await page.getByRole("button", { name: SETUP.create }).click();
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
    await expect(page.getByRole("heading", { name: LOGIN.title })).toBeVisible();
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
  await expect(page.getByRole("heading", { level: 1, name: "Threadsift" })).toBeVisible();

  for (const theme of THEMES) {
    await storeSettings(page, { theme }, "/settings");
    await expect(page.getByRole("heading", { name: SETTINGS.title })).toBeVisible();

    if (theme === THEMES[0]) {
      await checkAtEveryWidth(page, `tokens, no token yet, ${theme}`);
    }

    await page.getByLabel(SETTINGS.tokenName).fill(`Extension ${theme}`);
    await page.getByRole("button", { name: SETTINGS.createToken }).click();
    await expect(page.getByLabel(SETTINGS.tokenValue)).toBeVisible();
    await checkAtEveryWidth(page, `token shown once, ${theme}`);

    await page.getByRole("button", { name: SETTINGS.done }).click();
    await checkAtEveryWidth(page, `tokens listed, ${theme}`);

    await page.getByRole("button", { name: SETTINGS.revoke }).first().click();
    await expect(page.getByRole("button", { name: SETTINGS.revokeConfirm })).toBeVisible();
    await checkAtEveryWidth(page, `revoke question, ${theme}`);
    await page.getByRole("button", { name: SETTINGS.cancel }).click();
  }
});
