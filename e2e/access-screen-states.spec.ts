import { type Browser, type Page, type Route, expect, test } from "@playwright/test";

import { FIELDS, LOGIN, RESET, SETTINGS, SETUP } from "../web/src/access-text.ts";
import { launchFresh, minimumPassword, newCode, newPassword } from "./access.ts";
import { type FreshScreen, openFresh, openSignedIn, setUpByApi } from "./fresh-screen.ts";
import { afterTwoFrames } from "./look.ts";
import { newResetCode, resetEnv } from "./password.ts";
import { confirmField, enterCode, libraryHeading, passwordField } from "./setup-screens.ts";
import { addToken, mint, revokeOf } from "./tokens.ts";

test.use({ trace: "off", video: "off" });

const password = minimumPassword();
const SESSION_CHECK_WAIT_MS = 11_000;

function confirmRevoke(page: Page) {
  return page.getByRole("button", { name: SETTINGS.revokeConfirm });
}

async function holdDeletes(page: Page): Promise<{ held: Route[]; count: () => number }> {
  const held: Route[] = [];
  let count = 0;

  await page.route("**/api/tokens/*", async (route) => {
    if (route.request().method() !== "DELETE") {
      await route.fallback();

      return;
    }

    count += 1;
    held.push(route);
  });

  return { held, count: () => count };
}

async function onSettings(
  browser: Browser,
  work: (screen: Readonly<FreshScreen>) => Promise<void>,
): Promise<void> {
  const screen = await openSignedIn(browser, newCode(), password);

  try {
    await screen.page.goto("/settings");
    await work(screen);
  } finally {
    await screen.close();
  }
}

test("a second press of Revoke while the first is on its way sends no second request and shows no failure", async ({
  browser,
}) => {
  await onSettings(browser, async ({ page }) => {
    await addToken(page, "Twice");

    const { held, count } = await holdDeletes(page);

    await revokeOf(page, "Twice").click();
    await confirmRevoke(page).click();
    await expect.poll(count).toBe(1);
    await confirmRevoke(page).click({ force: true });

    for (const route of held) await route.continue();

    await expect(revokeOf(page, "Twice")).toHaveCount(0);
    expect(count()).toBe(1);
    await expect(page.getByText(SETTINGS.revokeFailed)).toHaveCount(0);
  });
});

test("a refused Revoke names the failure until the owner cancels or asks about another token", async ({
  browser,
}) => {
  await onSettings(browser, async ({ page }) => {
    await addToken(page, "Kept one");
    await addToken(page, "Kept two");
    await page.route("**/api/tokens/*", async (route) => {
      if (route.request().method() === "DELETE") await route.fulfill({ status: 500 });
      else await route.fallback();
    });

    await revokeOf(page, "Kept one").click();
    await confirmRevoke(page).click();
    await expect(page.getByText(SETTINGS.revokeFailed)).toBeVisible();

    await page.getByRole("button", { name: SETTINGS.cancel }).click();
    await expect(page.getByText(SETTINGS.revokeFailed)).toHaveCount(0);

    await revokeOf(page, "Kept one").click();
    await confirmRevoke(page).click();
    await expect(page.getByText(SETTINGS.revokeFailed)).toBeVisible();

    await revokeOf(page, "Kept two").click();
    await expect(page.getByText(SETTINGS.revokeFailed)).toHaveCount(0);
  });
});

test("a finished Revoke leaves the question the owner opened on another token", async ({
  browser,
}) => {
  await onSettings(browser, async ({ page }) => {
    await addToken(page, "Going");
    await addToken(page, "Asked about");

    const { held, count } = await holdDeletes(page);

    await revokeOf(page, "Going").click();
    await confirmRevoke(page).click();
    await expect.poll(count).toBe(1);
    await revokeOf(page, "Asked about").click();
    await expect(confirmRevoke(page)).toBeVisible();

    for (const route of held) await route.continue();

    await expect(revokeOf(page, "Going")).toHaveCount(0);
    await expect(confirmRevoke(page)).toBeVisible();
  });
});

test("a Revoke refused after the owner cancelled, or asked about another token, shows no failure", async ({
  browser,
}) => {
  await onSettings(browser, async ({ page }) => {
    await addToken(page, "Late one");
    await addToken(page, "Late two");

    const { held, count } = await holdDeletes(page);

    await revokeOf(page, "Late one").click();
    await confirmRevoke(page).click();
    await expect.poll(count).toBe(1);
    await page.getByRole("button", { name: SETTINGS.cancel }).click();
    await held[0]?.fulfill({ status: 500 });
    await afterTwoFrames(page);
    await expect(page.getByText(SETTINGS.revokeFailed)).toHaveCount(0);

    await revokeOf(page, "Late one").click();
    await confirmRevoke(page).click();
    await expect.poll(count).toBe(2);
    await revokeOf(page, "Late two").click();
    await held[1]?.fulfill({ status: 500 });
    await afterTwoFrames(page);
    await expect(confirmRevoke(page)).toBeVisible();
    await expect(page.getByText(SETTINGS.revokeFailed)).toHaveCount(0);
  });
});

test("a copy that fails right after one that worked shows the failure and no Copied", async ({
  browser,
}) => {
  await onSettings(browser, async ({ page, context, fresh }) => {
    const origin = new URL(fresh.url).origin;
    await page.clock.install();
    await page.goto("/settings");
    await mint(page, "Copy twice");
    await page.clock.pauseAt(new Date(Date.now() + 1000));

    await context.grantPermissions(["clipboard-write"], { origin });
    await page.getByRole("button", { name: SETTINGS.copy, exact: true }).click();
    await expect(page.getByRole("button", { name: SETTINGS.copied, exact: true })).toBeVisible();

    await context.clearPermissions();
    await page.getByRole("button", { name: SETTINGS.copied, exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText(SETTINGS.copyFailed);
    await expect(page.getByRole("button", { name: SETTINGS.copy, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: SETTINGS.copied, exact: true })).toHaveCount(0);
  });
});

test("a token list that failed to load keeps saying so after a token is added", async ({
  browser,
}) => {
  const screen = await openSignedIn(browser, newCode(), password);

  try {
    const { page } = screen;

    await page.route("**/api/tokens", async (route) => {
      if (route.request().method() === "GET") await route.fulfill({ status: 500 });
      else await route.fallback();
    });
    await page.goto("/settings");
    await expect(page.getByText(SETTINGS.tokensLoadFailed)).toBeVisible();

    await addToken(page, "After the failure");

    await expect(revokeOf(page, "After the failure")).toBeVisible();
    await expect(page.getByText(SETTINGS.tokensLoadFailed)).toBeVisible();
  } finally {
    await screen.close();
  }
});

test("Back to code does nothing while the password is being set, and the setup finishes", async ({
  browser,
}) => {
  const code = newCode();
  const screen = await openFresh(browser, code);

  try {
    const { page } = screen;
    const held: Route[] = [];

    await page.route("**/api/setup", (route) => {
      held.push(route);
    });
    await page.goto("/");
    await enterCode(page, code);
    await passwordField(page).fill(password);
    await confirmField(page).fill(password);
    await page.getByRole("button", { name: SETUP.create }).click();
    await expect.poll(() => held.length).toBe(1);

    await page.getByRole("button", { name: SETUP.backToCode }).click({ force: true });
    await expect(passwordField(page)).toBeVisible();

    for (const route of held) await route.continue();

    await expect(libraryHeading(page)).toBeVisible();
  } finally {
    await screen.close();
  }
});

test("a session check that never answers ends on the unreachable screen with Retry", async ({
  page,
}) => {
  const held: Route[] = [];

  await page.clock.install();
  await page.route("**/api/session", (route) => {
    held.push(route);
  });
  await page.goto("/");
  await expect.poll(() => held.length).toBe(1);
  await page.clock.fastForward(SESSION_CHECK_WAIT_MS);

  await expect(page.getByRole("alert")).toHaveText(LOGIN.unreachable);
});

test("the password-reset notice is gone once the owner opens the reset screen again", async ({
  browser,
}) => {
  const setup = newCode();
  const resetCode = newResetCode();
  const first = newPassword();
  const fresh = launchFresh(setup, resetEnv(resetCode));

  try {
    await setUpByApi(fresh.url, setup, first);

    const context = await browser.newContext({ baseURL: fresh.url });
    const page = await context.newPage();

    await page.goto("/");
    await page.getByRole("link", { name: LOGIN.lost }).click();
    await page.getByLabel(RESET.codeLabel, { exact: true }).fill(resetCode);
    const next = newPassword();

    await passwordField(page).fill(next);
    await page.getByLabel(FIELDS.confirmPassword, { exact: true }).fill(next);
    await page.getByRole("button", { name: RESET.button }).click();
    await expect(page.getByText(LOGIN.resetDone)).toBeVisible();

    await page.getByRole("link", { name: LOGIN.lost }).click();
    await page.getByRole("link", { name: RESET.back }).click();

    await expect(page.getByRole("heading", { name: LOGIN.heading })).toBeVisible();
    await expect(page.getByText(LOGIN.resetDone)).toHaveCount(0);
    await context.close();
  } finally {
    fresh.stop();
  }
});
