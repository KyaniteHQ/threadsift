import { type BrowserContext, type Page, expect, test } from "@playwright/test";

import { LOGIN, PASSWORD, SETTINGS, SETUP } from "../web/src/access-text.ts";
import {
  ListedTokens,
  cookieHeader,
  createToken,
  expectRefusal,
  sha256Hex,
} from "./access-helpers.ts";
import {
  type Instance,
  bearer,
  launchFresh,
  newCode,
  newPassword,
  strangerPool,
} from "./access.ts";
import { endLock, setUpByApi } from "./fresh-screen.ts";
import {
  WRONG_ATTEMPTS,
  changeCall,
  cookieValue,
  fillChange,
  openOwner,
  ownerHashDigest,
  passwordSection,
  signInWith,
  storedSessions,
  throttleRows,
} from "./password.ts";

const TEST_TIMEOUT_MS = 240_000;
const RETRY_AFTER_MAX = 60;

let fresh: Instance;
let password = newPassword();
const code = newCode();
const strangers = strangerPool();

test.describe.configure({ mode: "serial", timeout: TEST_TIMEOUT_MS });

test.beforeAll(async () => {
  fresh = launchFresh(code);
  await setUpByApi(fresh.url, code, password);
});

test.afterAll(async () => {
  await strangers.disposeAll();
  fresh.stop();
});

test.beforeEach(() => {
  fresh.sql("DELETE FROM throttles");
});

function settingsHeading(page: Page) {
  return page.getByRole("heading", { level: 1, name: SETTINGS.title });
}

async function expectWrongCurrentChangesNothing(page: Page, next: string): Promise<void> {
  const hashBefore = ownerHashDigest(fresh);
  const sessionsBefore = storedSessions(fresh);

  await fillChange(page, `${password}x`, next);
  await expect(passwordSection(page).getByText(PASSWORD.currentWrong)).toBeVisible();
  await expect(settingsHeading(page)).toBeVisible();
  expect(ownerHashDigest(fresh), "a wrong current password changes nothing").toBe(hashBefore);
  expect(storedSessions(fresh), "and ends no session").toEqual(sessionsBefore);
}

async function expectOldAndNewCookie(oldValue: string, newValue: string): Promise<void> {
  const stranger = await strangers.at(fresh.url);
  const old = await stranger.get("/api/items", { headers: cookieHeader(oldValue) });
  await expectRefusal(old, 401, "the first browser's old cookie");
  const current = await stranger.get("/api/items", { headers: cookieHeader(newValue) });
  expect(current.status(), "the first browser's new cookie").toBe(200);
}

async function expectPasswordsSwapped(next: string): Promise<void> {
  const stranger = await strangers.at(fresh.url);
  const old = await stranger.post("/api/login", { data: { password } });
  await expectRefusal(old, 401, "the old password", "wrong");
  const fresher = await stranger.post("/api/login", { data: { password: next } });
  expect(fresher.status(), "the new password").toBe(204);
  password = next;
}

async function expectTokenKept(first: BrowserContext, value: string, id: number): Promise<void> {
  const stranger = await strangers.at(fresh.url);
  const listed = await stranger.get("/api/items", { headers: bearer(value) });
  expect(listed.status(), "the agent token still lists Items").toBe(200);
  const tokens = ListedTokens.parse(await (await first.request.get("/api/tokens")).json());
  expect(tokens.tokens.map((entry) => entry.id)).toContain(id);
}

test("a change from one of two browsers ends the other, renews the first and keeps the token", async ({
  browser,
}) => {
  const first = await openOwner(browser, fresh, password);
  const second = await openOwner(browser, fresh, password);
  const token = await createToken(first.request, "Agent");
  const oldValue = await cookieValue(first);
  const next = newPassword();
  const page = await first.newPage();
  const other = await second.newPage();
  await page.goto("/settings");
  await other.goto("/");
  await expect(settingsHeading(page)).toBeVisible();

  await expectWrongCurrentChangesNothing(page, next);
  await fillChange(page, password, next);
  await expect(passwordSection(page).getByRole("status")).toHaveText(PASSWORD.changed);
  await expect.poll(() => cookieValue(first)).not.toBe(oldValue);
  const newValue = await cookieValue(first);
  expect(storedSessions(fresh), "exactly the rotated session").toEqual([sha256Hex(newValue)]);

  expect((await second.request.get("/api/items")).status(), "the other browser").toBe(401);
  await other.reload();
  await expect(other.getByRole("heading", { name: LOGIN.heading })).toBeVisible();

  await expectOldAndNewCookie(oldValue, newValue);
  await expectPasswordsSwapped(next);
  await expectTokenKept(first, token.value, token.token.id);
  await first.close();
  await second.close();
});

test("ten wrong current passwords lock the shared login lock, and a refused new password counts nothing", async () => {
  const owner = await signInWith(fresh.url, password);
  const next = newPassword();

  for (let attempt = 0; attempt < WRONG_ATTEMPTS; attempt += 1) {
    const wrong = await changeCall(owner.api, owner.headers, `${password}x${attempt}`, next);
    await expectRefusal(wrong, 403, `wrong current password ${attempt}`, "wrong");
  }

  const locked = await changeCall(owner.api, owner.headers, password, next);
  await expectRefusal(locked, 429, "the right current password during the lock", "locked");
  const seconds = Number(locked.headers()["retry-after"]);
  expect(seconds, "Retry-After").toBeGreaterThan(0);
  expect(seconds, "Retry-After").toBeLessThanOrEqual(RETRY_AFTER_MAX);

  const stranger = await strangers.at(fresh.url);
  const login = await stranger.post("/api/login", { data: { password } });
  await expectRefusal(login, 429, "a login with the right password", "locked");

  const short = await changeCall(owner.api, owner.headers, password, "p".repeat(14));
  await expectRefusal(short, 400, "a new password of 14 characters", "password-short");
  const long = await changeCall(owner.api, owner.headers, password, "p".repeat(1025));
  await expectRefusal(long, 400, "a new password of 1,025 characters", "password-long");
  expect(throttleRows(fresh), "one shared lock, no attempt counted for a refused password").toEqual(
    [{ kind: "login", failures: WRONG_ATTEMPTS }],
  );

  endLock(fresh, "login");
  expect((await changeCall(owner.api, owner.headers, password, next)).status()).toBe(204);
  password = next;
  expect(throttleRows(fresh), "a success clears the lock").toEqual([]);
  await owner.api.dispose();
});

test("a stranger gets 401, a token 403 and a cross-site form post 403, and none changes anything", async () => {
  const owner = await signInWith(fresh.url, password);
  const stranger = await strangers.at(fresh.url);
  const token = await createToken(owner.api, "Probe");
  const hashBefore = ownerHashDigest(fresh);
  const next = newPassword();

  const anonymous = await changeCall(stranger, {}, password, next);
  await expectRefusal(anonymous, 401, "a stranger on POST /api/password");
  const withToken = await changeCall(stranger, bearer(token.value), password, next);
  await expectRefusal(withToken, 403, "a token on POST /api/password");

  const forged = await owner.api.post("/api/password", {
    form: { current: password, password: next },
    headers: { ...owner.headers, origin: "https://evil.example", "sec-fetch-site": "cross-site" },
  });

  await expectRefusal(forged, 403, "a cross-site form post with the owner's cookie");

  expect(ownerHashDigest(fresh), "no probe changed the password").toBe(hashBefore);
  await owner.api.dispose();
});

test("in the browser a wrong current password leaves Settings open, and a revoked session opens sign-in", async ({
  browser,
}) => {
  const context = await openOwner(browser, fresh, password);
  const page = await context.newPage();
  const next = newPassword();
  await page.goto("/settings");
  await expect(settingsHeading(page)).toBeVisible();

  await fillChange(page, `${password}x`, next, `${next}y`);
  await expect(passwordSection(page).getByText(SETUP.passwordMismatch)).toBeVisible();
  await fillChange(page, `${password}x`, next);
  await expect(passwordSection(page).getByText(PASSWORD.currentWrong)).toBeVisible();
  await expect(settingsHeading(page)).toBeVisible();

  fresh.sql("DELETE FROM sessions");
  await fillChange(page, password, next);
  await expect(page.getByRole("heading", { name: LOGIN.heading })).toBeVisible();
  expect(storedSessions(fresh), "the refused change started no session").toEqual([]);
  await context.close();
});
