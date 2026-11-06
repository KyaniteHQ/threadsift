import { expect, test } from "@playwright/test";

import { createToken, expectRefusal } from "./access-helpers.ts";
import {
  type Instance,
  bearer,
  launchFresh,
  newCode,
  newPassword,
  strangerPool,
} from "./access.ts";
import { lockFor, setUpByApi } from "./fresh-screen.ts";
import {
  RESET_CODE_MINIMUM,
  WRONG_ATTEMPTS,
  newResetCode,
  ownerHashDigest,
  resetCall,
  resetEnv,
  setCookieLines,
  shortResetCode,
  signInWith,
  spentCodes,
  storedSessions,
  throttleRows,
} from "./password.ts";

const TEST_TIMEOUT_MS = 300_000;

let fresh: Instance;
let password = newPassword();
const code = newCode();
const first = newResetCode();
const strangers = strangerPool();

test.describe.configure({ mode: "serial", timeout: TEST_TIMEOUT_MS });

test.beforeAll(() => {
  fresh = launchFresh(code, resetEnv(first));
});

test.afterAll(async () => {
  await strangers.disposeAll();
  fresh.stop();
});

test.beforeEach(() => {
  fresh.sql("DELETE FROM throttles");
});

async function reset(sent: string, next = newPassword()) {
  const stranger = await strangers.at(fresh.url);

  return resetCall(stranger, sent, next);
}

test("with no owner the reset is refused and creates none", async () => {
  const stranger = await strangers.at(fresh.url);
  await expectRefusal(await reset(first), 409, "a reset before setup", "no-owner");
  expect(await (await stranger.get("/api/session")).json()).toEqual({
    state: "setup",
    code: "set",
  });
  await setUpByApi(fresh.url, code, password);
});

test("a server with no code answers 503 reset-missing, and one with 31 characters 503 reset-short", async () => {
  fresh.restart({});
  await expectRefusal(await reset(first), 503, "no reset code", "reset-missing");

  fresh.restart(resetEnv(shortResetCode()));
  expect(shortResetCode()).toHaveLength(RESET_CODE_MINIMUM - 1);
  await expectRefusal(await reset(first), 503, "a 31-character code", "reset-short");
  expect(spentCodes(fresh)).toEqual([]);

  fresh.restart(resetEnv(first));
  expect(first).toHaveLength(RESET_CODE_MINIMUM);
  await expectRefusal(await reset("x".repeat(40)), 403, "a wrong code", "wrong");
});

test("ten wrong codes lock the reset kind alone, and ten wrong passwords do not lock the reset", async () => {
  const stranger = await strangers.at(fresh.url);

  for (let attempt = 0; attempt < WRONG_ATTEMPTS; attempt += 1) {
    const wrong = await reset(`${first}${attempt}`);
    expect(wrong.status(), `wrong code ${attempt}`).toBe(403);
  }

  const locked = await reset(first);
  await expectRefusal(locked, 429, "the right code during the lock", "locked");
  expect(Number(locked.headers()["retry-after"]), "Retry-After").toBeGreaterThan(0);
  expect((await signInWith(fresh.url, password)).value, "login still works").not.toBe("");
  expect(spentCodes(fresh), "nothing was spent").toEqual([]);

  fresh.sql("DELETE FROM throttles");

  for (let attempt = 0; attempt < WRONG_ATTEMPTS; attempt += 1) {
    const wrong = await stranger.post("/api/login", {
      data: { password: `${password}x${attempt}` },
    });

    expect(wrong.status(), `wrong password ${attempt}`).toBe(401);
  }

  await expectRefusal(await reset(`${first}x`), 403, "a wrong code while login is locked", "wrong");
  const lockedLogin = await stranger.post("/api/login", { data: { password } });
  await expectRefusal(lockedLogin, 429, "login", "locked");
  expect(throttleRows(fresh), "two kinds, two counts").toEqual([
    { kind: "login", failures: WRONG_ATTEMPTS },
    { kind: "reset", failures: 1 },
  ]);
});

test("a refused new password counts no attempt and spends nothing", async () => {
  await expectRefusal(await reset(first, "p".repeat(14)), 400, "14 characters", "password-short");
  await expectRefusal(
    await reset(first, "p".repeat(1025)),
    400,
    "1,025 characters",
    "password-long",
  );
  expect(throttleRows(fresh)).toEqual([]);
  expect(spentCodes(fresh)).toEqual([]);
});

test("the right code ends every session, keeps the token and clears a login lock", async () => {
  const owner = await signInWith(fresh.url, password);
  const other = await signInWith(fresh.url, password);
  const token = await createToken(owner.api, "Agent");
  const next = newPassword();
  lockFor(fresh, "login", 120_000);

  const done = await reset(first, next);
  expect(done.status(), "the reset").toBe(204);
  expect(setCookieLines(done), "no cookie").toEqual([]);

  for (const session of [owner, other]) {
    const refused = await session.api.get("/api/items", { headers: session.headers });
    await expectRefusal(refused, 401, "an old session after the reset");
  }

  expect(storedSessions(fresh)).toEqual([]);
  expect(throttleRows(fresh), "the login lock is gone").toEqual([]);

  const stranger = await strangers.at(fresh.url);
  const listed = await stranger.get("/api/items", { headers: bearer(token.value) });
  expect(listed.status(), "the agent token still works").toBe(200);
  const old = await stranger.post("/api/login", { data: { password } });
  await expectRefusal(old, 401, "the old password", "wrong");
  password = next;
  expect((await signInWith(fresh.url, password)).value, "the new password").not.toBe("");
});

test("the same code answers 409 reset-used, and a restart does not bring it back", async () => {
  await expectRefusal(await reset(first), 409, "the spent code", "reset-used");
  fresh.restart(resetEnv(first));
  await expectRefusal(await reset(first), 409, "the spent code after a restart", "reset-used");
  expect(spentCodes(fresh)).toHaveLength(1);
});

test("a spent code stays refused after later codes are used", async () => {
  const second = newResetCode();
  fresh.restart(resetEnv(second));
  const next = newPassword();
  expect((await reset(second, next)).status(), "a new code").toBe(204);
  password = next;
  expect(spentCodes(fresh)).toHaveLength(2);

  fresh.restart(resetEnv(first));
  await expectRefusal(await reset(first), 409, "the first code, configured again", "reset-used");
  fresh.restart(resetEnv(second));
  await expectRefusal(await reset(second), 409, "the second code", "reset-used");

  const hashBefore = ownerHashDigest(fresh);
  await expectRefusal(await reset(second), 409, "once more", "reset-used");
  expect(ownerHashDigest(fresh), "a refused reset changes nothing").toBe(hashBefore);
});
