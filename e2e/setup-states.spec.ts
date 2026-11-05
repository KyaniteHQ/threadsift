import { type Page, expect, test } from "@playwright/test";

import { LOGIN, SETUP } from "../web/src/access-text.ts";
import { minimumPassword, newCode } from "./access.ts";
import {
  type FreshScreen,
  LOCK_MS,
  expectCountdown,
  lockFor,
  openFresh,
  setUpByApi,
} from "./fresh-screen.ts";
import { codeField, enterCode, passwordField, submitPassword } from "./setup-screens.ts";

const code = newCode();
const password = minimumPassword();

function signInHeading(page: Page) {
  return page.getByRole("heading", { level: 1, name: LOGIN.heading });
}

function screenHooks(): () => FreshScreen {
  let held: FreshScreen | undefined;

  test.beforeAll(async ({ browser }) => {
    held = await openFresh(browser, code);
  });

  test.afterAll(async () => {
    await held?.close();
  });

  return () => {
    if (held === undefined) {
      throw new Error("The screen is not open yet");
    }

    return held;
  };
}

test.describe("an owner appears while the setup screen is open", () => {
  const current = screenHooks();

  test.beforeEach(() => {
    current().fresh.sql("DELETE FROM owner");
  });

  test("the code step finds out when the code is sent, and shows sign-in", async () => {
    const { page, fresh } = current();
    await page.goto("/");
    await expect(codeField(page)).toBeFocused();

    await setUpByApi(fresh.url, code, password);
    await enterCode(page, code);

    await expect(signInHeading(page)).toBeVisible();
    await expect(passwordField(page)).toBeFocused();
  });

  test("the password step finds out when the password is sent, and shows sign-in", async () => {
    const { page, fresh } = current();
    await page.goto("/");
    await enterCode(page, code);
    await expect(passwordField(page)).toBeFocused();

    await setUpByApi(fresh.url, code, password);
    await submitPassword(page, password);

    await expect(signInHeading(page)).toBeVisible();
  });
});

test.describe("setup is locked", () => {
  const current = screenHooks();

  test("the code step counts down in the page, says when it ends and then accepts the code", async () => {
    const { page, fresh } = current();
    await page.goto("/");
    lockFor(fresh, "setup", LOCK_MS);
    await enterCode(page, code);

    await expectCountdown(page.getByRole("alert"));

    await page.getByRole("button", { name: SETUP.continue }).click();
    await expect(passwordField(page)).toBeFocused();
  });

  test("the password step counts down in the page and ends", async () => {
    const { page, fresh } = current();
    await page.goto("/");
    await enterCode(page, code);
    await expect(passwordField(page)).toBeFocused();

    lockFor(fresh, "setup", LOCK_MS);
    await submitPassword(page, password);

    await expectCountdown(page.getByRole("alert"));
  });
});
