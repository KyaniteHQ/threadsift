import { type Page, expect, test } from "@playwright/test";

import { LOGIN, SETUP } from "../web/src/access-text.ts";
import { SIGNED_OUT, newCode } from "./access.ts";
import { type FreshScreen, openFresh } from "./fresh-screen.ts";
import { DESKTOP } from "./look.ts";
import { codeField, enterCode, passwordField, submitPassword } from "./setup-screens.ts";

const code = newCode();
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
  await page.setViewportSize(DESKTOP);
  await page.goto("/");
  await expect(codeField(page)).toBeFocused();
  const resting = await markTop(page);

  await enterCode(page, `${code}x`);
  await expect(page.getByRole("alert")).toHaveText(SETUP.codeWrong);
  expect(await markTop(page), "with a wrong-code error").toBe(resting);

  await enterCode(page, code);
  await expect(passwordField(page)).toBeFocused();
  expect(await markTop(page), "on the password step").toBe(resting);

  await submitPassword(page, "a-long-enough-password", "a-different-password");
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

test("step 1 gives each install target one sentence and shows the names to look for in code style", async () => {
  const { page } = screen;
  await page.goto("/");

  const container = page.getByText(SETUP.codeWhereContainer, { exact: true });
  const worker = page.getByText(SETUP.codeWhereWorker, { exact: true });
  await expect(container).toBeVisible();
  await expect(worker).toBeVisible();
  await expect(container.locator("code")).toHaveText(["SETUP_CODE", "Setup code:"]);
  await expect(worker.locator("code")).toHaveText("SETUP_CODE");

  const [inCode, around] = await container.evaluate((paragraph) => [
    getComputedStyle(paragraph.querySelector("code") ?? paragraph).fontFamily,
    getComputedStyle(paragraph).fontFamily,
  ]);

  expect(inCode).not.toBe(around);
});

test("the sign-in heading differs from the Sign in button", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL: baseURL ?? "", storageState: SIGNED_OUT });
  const page = await context.newPage();
  await page.goto("/");

  const heading = page.getByRole("heading", { level: 1, name: LOGIN.heading });
  const button = page.getByRole("button", { name: LOGIN.signIn });
  await expect(heading).toBeVisible();
  await expect(button).toBeVisible();
  expect(await heading.textContent(), "the heading and the button read differently").not.toBe(
    await button.textContent(),
  );
  await context.close();
});
