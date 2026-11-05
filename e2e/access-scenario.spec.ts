import {
  type APIRequestContext,
  type BrowserContext,
  type Page,
  type TestInfo,
  expect,
  test,
} from "@playwright/test";

import { LOGIN, SETTINGS, SETUP, filled } from "../web/src/access-text.ts";
import { cookieHeader } from "./access-helpers.ts";
import {
  type Instance,
  SESSION_COOKIE,
  anonymous,
  bearer,
  launchFresh,
  newCode,
  minimumPassword,
} from "./access.ts";
import { type Entry, call, violations, watchPage } from "./ledger.ts";
import { newRunId, pasteField, pasteLink } from "./links.ts";
import {
  choosePassword,
  codeField,
  enterCode,
  libraryHeading,
  passwordField,
  submitPassword,
  tokenNameField,
} from "./setup-screens.ts";

const TEST_TIMEOUT_MS = 120_000;
const CLIPBOARD = ["clipboard-read", "clipboard-write"];

interface Run {
  readonly page: Page;
  readonly context: BrowserContext;
  readonly outside: APIRequestContext;
  readonly info: TestInfo;
  readonly ledger: Entry[];
}

let fresh: Instance;
const code = newCode();
const password = minimumPassword();

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  fresh = launchFresh(code);
});

test.afterAll(() => {
  fresh.stop();
});

async function shot(run: Run, name: string): Promise<void> {
  await run.info.attach(name, { body: await run.page.screenshot(), contentType: "image/png" });
}

async function seeRows(page: Page, links: readonly string[]): Promise<void> {
  const rows = page.locator("article.it");
  await expect(rows).toHaveCount(links.length);

  for (const [index, link] of links.entries()) {
    await expect(rows.nth(index)).toContainText(link.replace(/^https?:\/\//u, ""));
  }
}

async function stepSetup(run: Run): Promise<void> {
  const { page } = run;
  await page.goto("/");
  await expect(page).toHaveTitle("Set up Threadsift");
  await expect(codeField(page)).toBeFocused();
  await shot(run, "1-setup-code");

  await enterCode(page, `${code}x`);
  await expect(page.getByText(SETUP.codeWrong)).toBeVisible();
  await expect(codeField(page)).toBeFocused();
  await expect(codeField(page)).toHaveValue(`${code}x`);

  await enterCode(page, code);
  await expect(passwordField(page)).toBeFocused();
  await shot(run, "2-setup-password");

  await submitPassword(page, password, `${password}x`);
  await expect(page.getByText(SETUP.passwordMismatch)).toBeVisible();

  await choosePassword(page, password);
  await expect(libraryHeading(page)).toBeVisible();
  await expect(page).toHaveTitle("Threadsift");
  const names = (await run.context.cookies()).map((cookie) => cookie.name);
  expect(names, "Chromium keeps the Secure cookie set over http").toContain(SESSION_COOKIE);
}

async function openSettings(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: SETTINGS.instanceSettings }).click();
  await expect(page).toHaveTitle("Settings, Threadsift");
}

async function stepToken(run: Run): Promise<string> {
  const { page } = run;
  await openSettings(page);
  await expect(tokenNameField(page)).toBeFocused();

  await tokenNameField(page).fill("Extension");
  await page.getByRole("button", { name: SETTINGS.createToken }).click();
  const value = await page.getByLabel(SETTINGS.tokenValue).inputValue();
  expect(value).toMatch(/^tsa_/u);
  await shot(run, "3-token-shown-once");

  await page.getByRole("button", { name: SETTINGS.copy }).click();
  await expect(page.getByRole("button", { name: SETTINGS.copied })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(value);
  await page.getByRole("button", { name: SETTINGS.done }).click();

  await page.reload();
  await expect(page.getByText("Extension", { exact: true })).toBeVisible();
  expect(await page.content(), "a reload never shows the value").not.toContain(value);

  return value;
}

async function stepAgent(run: Run, value: string, link: string): Promise<void> {
  const headers = bearer(value);

  const saved = await call(run.ledger, "agent token", run.outside, "POST", "/api/items", {
    data: { url: link },
    headers,
  });

  expect(saved.status()).toBe(201);

  for (const [method, path] of [
    ["GET", "/api/tokens"],
    ["POST", "/api/logout"],
  ] as const) {
    const refused = await call(run.ledger, "agent token", run.outside, method, path, { headers });

    expect(refused.status(), `${method} ${path}`).toBe(403);
  }
}

async function stepSignOut(run: Run, links: readonly string[]): Promise<void> {
  const { page, context, outside, ledger } = run;
  const cookie = (await context.cookies()).find((entry) => entry.name === SESSION_COOKIE);
  await seeRows(page, links);
  await openSettings(page);
  await page.getByRole("button", { name: SETTINGS.signOut }).click();

  await expect(page).toHaveTitle("Sign in to Threadsift");
  await expect(passwordField(page)).toBeFocused();
  await shot(run, "4-login");

  const ended = cookieHeader(cookie?.value ?? "");

  const afterwards = await call(ledger, "ended session", outside, "GET", "/api/items", {
    headers: ended,
  });

  expect(afterwards.status(), "a signed-out session").toBe(401);
  const nobody = await call(ledger, "nobody", outside, "GET", "/api/items");
  expect(nobody.status()).toBe(401);

  await passwordField(page).fill(`${password}x`);
  await page.getByRole("button", { name: LOGIN.signIn }).click();
  await expect(page.getByText(LOGIN.wrong)).toBeVisible();
  await expect(passwordField(page)).toBeFocused();
  await expect(passwordField(page)).toHaveValue("");

  await passwordField(page).fill(password);
  await page.getByRole("button", { name: LOGIN.signIn }).click();
  await seeRows(page, links);
}

async function stepRevoke(run: Run, value: string): Promise<void> {
  const { page } = run;
  await openSettings(page);
  await page
    .getByRole("button", { name: filled(SETTINGS.revokeNamed, { name: "Extension" }), exact: true })
    .click();
  await expect(page.getByText("Revoke Extension?")).toBeVisible();
  await shot(run, "5-revoke-asks-in-place");
  await page.getByRole("button", { name: SETTINGS.revokeConfirm }).click();
  await expect(page.getByText("Extension", { exact: true })).toBeHidden();

  const refused = await call(run.ledger, "revoked token", run.outside, "POST", "/api/items", {
    data: { url: `https://example.com/${newRunId()}/after-revoke` },
    headers: bearer(value),
  });

  expect(refused.status(), "a revoked token").toBe(401);
}

test("a fresh Instance is set up, saved to, signed out of and its token revoked through the screens and the API", async ({
  browser,
}, testInfo) => {
  test.setTimeout(TEST_TIMEOUT_MS);

  const context = await browser.newContext({
    baseURL: fresh.url,
    permissions: CLIPBOARD,
  });

  const run: Run = {
    page: await context.newPage(),
    context,
    outside: await anonymous(fresh.url),
    info: testInfo,
    ledger: [],
  };

  watchPage(run.page, run.ledger);
  const first = `https://example.com/${newRunId()}/first`;
  const second = `https://example.com/${newRunId()}/second`;

  await stepSetup(run);
  await pasteLink(run.page, first);
  await seeRows(run.page, [first]);
  const value = await stepToken(run);
  await stepAgent(run, value, second);
  await run.page.goto("/");
  await seeRows(run.page, [second, first]);
  await stepSignOut(run, [second, first]);
  await stepRevoke(run, value);

  await testInfo.attach("api-statuses.json", {
    body: JSON.stringify(run.ledger, null, 2),
    contentType: "application/json",
  });
  expect(violations(run.ledger)).toEqual([]);
  expect(run.ledger.filter((entry) => entry.caller === "owner").length).toBeGreaterThan(10);
  await run.outside.dispose();
  await context.close();
});

test("a Paste after the owner signed out in another tab shows the login screen, not a failure notice", async ({
  browser,
}) => {
  const context = await browser.newContext({ baseURL: fresh.url });
  const [first, second] = [await context.newPage(), await context.newPage()];
  await first.goto("/");
  await passwordField(first).fill(password);
  await first.getByRole("button", { name: LOGIN.signIn }).click();
  await expect(pasteField(first)).toBeVisible();
  await second.goto("/");
  await expect(pasteField(second)).toBeVisible();

  await openSettings(first);
  await first.getByRole("button", { name: SETTINGS.signOut }).click();
  await expect(first.getByRole("heading", { name: LOGIN.heading })).toBeVisible();

  await pasteField(second).fill("https://example.com/x");
  await second.getByRole("button", { name: "Add" }).click();
  await expect(second.getByRole("heading", { name: LOGIN.heading })).toBeVisible();
  await expect(passwordField(second)).toBeFocused();
  await expect(second.getByRole("alert")).toHaveCount(0);
  await context.close();
});
