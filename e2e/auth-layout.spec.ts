import { type Page, expect, test } from "@playwright/test";

import { LOGIN, SETUP } from "../web/src/access-text.ts";
import { newCode } from "./access.ts";
import { type FreshScreen, openFresh } from "./fresh-screen.ts";
import { codeField, confirmField, enterCode, passwordField } from "./setup-screens.ts";

const code = newCode();
const SIGNED_OUT = { cookies: [], origins: [] };
const HALF_PIXEL = 0.5;

let screen: FreshScreen;

test.beforeAll(async ({ browser }) => {
  screen = await openFresh(browser, code);
});

test.afterAll(async () => {
  await screen.close();
});

async function markTop(page: Page): Promise<number> {
  const box = await page.getByText("Threadsift", { exact: true }).first().boundingBox();

  return box?.y ?? -1;
}

test("the wordmark stays put while the card changes height", async () => {
  const { page } = screen;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(codeField(page)).toBeFocused();
  const resting = await markTop(page);

  await codeField(page).fill(`${code}x`);
  await page.getByRole("button", { name: SETUP.continue }).click();
  await expect(page.getByRole("alert")).toHaveText(SETUP.codeWrong);
  expect(await markTop(page), "with a wrong-code error").toBe(resting);

  await codeField(page).fill(code);
  await page.getByRole("button", { name: SETUP.continue }).click();
  await expect(passwordField(page)).toBeFocused();
  expect(await markTop(page), "on the password step").toBe(resting);

  await passwordField(page).fill("a-long-enough-password");
  await confirmField(page).fill("a-different-password");
  await page.getByRole("button", { name: SETUP.create }).click();
  await expect(page.getByRole("alert")).toHaveText(SETUP.passwordMismatch);
  expect(await markTop(page), "with a mismatch error").toBe(resting);
});

test("Change setup code lines its text up with the form's left edge", async () => {
  const { page } = screen;
  await page.goto("/");
  await enterCode(page, code);
  await expect(passwordField(page)).toBeFocused();

  const heading = await page.getByRole("heading", { name: SETUP.passwordTitle }).boundingBox();

  const textLeft = await page.getByRole("button", { name: SETUP.backToCode }).evaluate((button) => {
    const range = document.createRange();
    range.selectNodeContents(button);

    return range.getBoundingClientRect().left;
  });

  expect(Math.abs(textLeft - (heading?.x ?? -1))).toBeLessThan(HALF_PIXEL);
});

test("step 1 names each install target and gives it one sentence", async () => {
  const { page } = screen;
  await page.goto("/");

  await expect(page.getByText(SETUP.codeWhereContainer, { exact: true })).toBeVisible();
  await expect(page.getByText(SETUP.codeWhereWorker, { exact: true })).toBeVisible();
});

test("the sign-in heading differs from the Sign in button", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL: baseURL ?? "", storageState: SIGNED_OUT });
  const page = await context.newPage();
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: LOGIN.heading })).toBeVisible();
  await expect(page.getByRole("button", { name: LOGIN.signIn })).toBeVisible();
  expect(LOGIN.heading).not.toBe(LOGIN.signIn);
  await context.close();
});
