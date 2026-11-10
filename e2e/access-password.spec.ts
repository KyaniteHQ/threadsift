import { type Browser, type Page, expect, test } from "@playwright/test";

import { FIELDS, LOGIN } from "../web/src/access-text.ts";
import { newCode, newPassword } from "./access.ts";
import { type FreshScreen, openFresh, setUpByApi } from "./fresh-screen.ts";
import { confirmField, enterCode, passwordField } from "./setup-screens.ts";

const code = newCode();
const password = newPassword();

function toggle(page: Page) {
  return page.getByRole("button", { name: FIELDS.showPassword });
}

function formMethods(page: Page): Promise<string[]> {
  return page
    .locator("form")
    .evaluateAll((forms) =>
      forms.map((form) => (form instanceof HTMLFormElement ? form.method : "")),
    );
}

const TWO_LAUNCHES_MS = 90_000;

const opened: FreshScreen[] = [];

let setup: FreshScreen;
let signIn: FreshScreen;

async function openScreen(browser: Browser): Promise<FreshScreen> {
  const screen = await openFresh(browser, code);
  opened.push(screen);

  return screen;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(TWO_LAUNCHES_MS);
  setup = await openScreen(browser);
  signIn = await openScreen(browser);
  await setUpByApi(signIn.fresh.url, code, password);
});

test.afterAll(async () => {
  await Promise.all(opened.map((screen) => screen.close()));
});

test.describe("setup form", () => {
  test("both forms post, so a failed handler never puts a secret in the address", async () => {
    const { page } = setup;
    await page.goto("/");
    await expect(page.locator("form")).toHaveCount(1);
    expect(await formMethods(page)).toEqual(["post"]);

    await enterCode(page, code);
    await expect(passwordField(page)).toBeFocused();
    expect(await formMethods(page)).toEqual(["post"]);
  });
});

test.describe("setup password fields", () => {
  test("one Show toggle on the first field shows both fields", async () => {
    const { page } = setup;
    await page.goto("/");
    await enterCode(page, code);
    await passwordField(page).fill(password);
    await confirmField(page).fill(password);

    await expect(toggle(page)).toHaveCount(1);
    await expect(passwordField(page)).toHaveAttribute("type", "password");
    await expect(confirmField(page)).toHaveAttribute("type", "password");

    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
    await expect(passwordField(page)).toHaveAttribute("type", "text");
    await expect(confirmField(page)).toHaveAttribute("type", "text");
  });

  test("the two password fields have their own names", async () => {
    const { page } = setup;
    await page.goto("/");
    await enterCode(page, code);
    const first = await passwordField(page).getAttribute("name");
    const second = await confirmField(page).getAttribute("name");

    expect(first).toBe("password");
    expect(second).not.toBe(first);
    expect(second).toBeTruthy();
  });

  test("the username hint is drawn, out of the Tab order and out of the reading order", async () => {
    const { page } = setup;
    await page.goto("/");
    await enterCode(page, code);
    const username = page.locator('input[name="username"]');

    expect(await username.evaluate((input) => getComputedStyle(input).display)).not.toBe("none");
    await expect(username).toHaveAttribute("tabindex", "-1");
    await expect(username).toHaveAttribute("aria-hidden", "true");

    await passwordField(page).focus();
    await page.keyboard.press("Tab");
    await expect(toggle(page)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(confirmField(page)).toBeFocused();
  });
});

test.describe("sign-in", () => {
  test("the form posts, and the username hint is drawn but not in the Tab order", async () => {
    const { page } = signIn;
    await page.goto("/");
    await expect(passwordField(page)).toBeFocused();
    expect(await formMethods(page)).toEqual(["post"]);

    const username = page.locator('input[name="username"]');
    expect(await username.evaluate((input) => getComputedStyle(input).display)).not.toBe("none");
    await expect(username).toHaveAttribute("tabindex", "-1");

    await page.keyboard.press("Tab");
    await expect(toggle(page)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: LOGIN.signIn })).toBeFocused();
  });

  test("a wrong password hides the password again", async () => {
    const { page } = signIn;
    await page.goto("/");
    await passwordField(page).fill(`${password}x`);
    await toggle(page).click();
    await expect(passwordField(page)).toHaveAttribute("type", "text");

    await passwordField(page).press("Enter");
    await expect(page.getByRole("alert")).toHaveText(LOGIN.wrong);
    await expect(passwordField(page)).toHaveAttribute("type", "password");
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
  });
});
