import { expect, test } from "@playwright/test";

import { expectRefusal } from "./access-helpers.ts";
import { type Instance, launchFresh, newCode, newPassword, strangerPool } from "./access.ts";
import { ownerHash, setCookieLines, storedSessions } from "./password.ts";

const TEST_TIMEOUT_MS = 120_000;

let fresh: Instance;
const code = newCode();
const password = newPassword();
const strangers = strangerPool();

test.describe.configure({ timeout: TEST_TIMEOUT_MS });

test.beforeAll(() => {
  fresh = launchFresh(code);
});

test.afterAll(async () => {
  await strangers.disposeAll();
  fresh.stop();
});

test("a setup whose password was reset between the owner insert and the session insert starts no session", async () => {
  const stranger = await strangers.at(fresh.url);

  fresh.sql(
    "CREATE TRIGGER reset_lands AFTER INSERT ON owner BEGIN UPDATE owner SET password_hash = password_hash || 'x' WHERE id = 1; DELETE FROM sessions; END",
  );

  try {
    const setup = await stranger.post("/api/setup", { data: { code, password } });
    await expectRefusal(setup, 409, "a setup that lost to a reset", "password-changed");
    expect(setCookieLines(setup), "no cookie").toEqual([]);
    expect(storedSessions(fresh), "no session was started").toEqual([]);
    expect(ownerHash(fresh), "the owner row exists").not.toBe("");
  } finally {
    fresh.sql("DROP TRIGGER reset_lands");
  }

  const login = await stranger.post("/api/login", { data: { password } });
  await expectRefusal(login, 401, "the password setup was given, now replaced", "wrong");
  expect(storedSessions(fresh), "the refused login started no session").toEqual([]);
});
