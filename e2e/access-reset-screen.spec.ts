import { type Page, expect, test } from "@playwright/test";

import { FIELDS, LOGIN, RESET, SETUP } from "../web/src/access-text.ts";
import { type Instance, launchFresh, newCode, newPassword } from "./access.ts";
import { setUpByApi } from "./fresh-screen.ts";
import { attachScreenshot, viewportAt } from "./look.ts";
import { newResetCode, resetEnv } from "./password.ts";
import { libraryHeading, passwordField } from "./setup-screens.ts";

const TEST_TIMEOUT_MS = 240_000;
const PHONE = 390;
const DESKTOP = 1440;

let fresh: Instance;
const password = newPassword();
const resetCode = newResetCode();
const next = newPassword();

test.describe.configure({ mode: "serial", timeout: TEST_TIMEOUT_MS });

test.beforeAll(async () => {
  const setup = newCode();
  fresh = launchFresh(setup, resetEnv(resetCode));
  await setUpByApi(fresh.url, setup, password);
});

test.afterAll(() => {
  fresh.stop();
});

function codeField(page: Page) {
  return page.getByLabel(RESET.codeLabel, { exact: true });
}

async function fillReset(page: Page, code: string, first: string, second = first): Promise<void> {
  await codeField(page).fill(code);
  await passwordField(page).fill(first);
  await page.getByLabel(FIELDS.confirmPassword, { exact: true }).fill(second);
  await page.getByRole("button", { name: RESET.button }).click();
}

async function openReset(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("link", { name: LOGIN.lost }).click();
  await expect(page.getByRole("heading", { name: RESET.heading })).toBeVisible();
  await expect(page).toHaveURL(/\/reset$/u);
}

async function expectInstructions(page: Page): Promise<void> {
  await expect(page.getByText(RESET.intro)).toBeVisible();
  await expect(page.getByText(RESET.container)).toBeVisible();
  await expect(page.getByText(RESET.worker)).toBeVisible();
  await expect(page.getByText(RESET.generate)).toBeVisible();
  await expect(page.getByText(RESET.remove)).toBeVisible();
  await expect(page.getByText(RESET.workerCommand)).toBeVisible();
  await expect(page.getByText(RESET.generateCommand)).toBeVisible();
}

test("the owner resets the password from the sign-in screen at desktop and phone widths", async ({
  browser,
}, info) => {
  const context = await browser.newContext({ baseURL: fresh.url });
  const page = await context.newPage();
  await viewportAt(page, DESKTOP);
  await openReset(page);
  await expectInstructions(page);
  await attachScreenshot(page, info, "reset-instructions-desktop");

  await fillReset(page, `${resetCode}x`, next);
  await expect(page.getByText(RESET.codeWrong)).toBeVisible();
  await attachScreenshot(page, info, "reset-wrong-code-desktop");

  await viewportAt(page, PHONE);
  await expectInstructions(page);
  await attachScreenshot(page, info, "reset-instructions-phone");
  await fillReset(page, resetCode, next, `${next}y`);
  await expect(page.getByText(SETUP.passwordMismatch)).toBeVisible();
  await attachScreenshot(page, info, "reset-mismatch-phone");

  await fillReset(page, resetCode, next);
  await expect(page.getByRole("heading", { name: LOGIN.heading })).toBeVisible();
  await expect(page.getByText(LOGIN.resetDone)).toBeVisible();
  await expect(page).toHaveURL(/\/$/u);
  await attachScreenshot(page, info, "signin-after-reset-phone");

  await passwordField(page).fill(next);
  await page.getByRole("button", { name: LOGIN.signIn }).click();
  await expect(libraryHeading(page)).toBeVisible();
  await context.close();
});

test("a spent code shows the used message, and a server with no code shows the missing one", async ({
  browser,
}) => {
  const context = await browser.newContext({ baseURL: fresh.url });
  const page = await context.newPage();
  await openReset(page);
  await fillReset(page, resetCode, newPassword());
  await expect(page.getByText(RESET.used)).toBeVisible();

  fresh.restart({});
  await page.reload();
  await fillReset(page, resetCode, newPassword());
  await expect(page.getByText(RESET.missing)).toBeVisible();

  await page.getByRole("link", { name: RESET.back }).click();
  await expect(page.getByRole("heading", { name: LOGIN.heading })).toBeVisible();
  await context.close();
});
