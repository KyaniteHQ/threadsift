import { expect, test } from "@playwright/test";

import { expectRefusal, sha256Hex } from "./access-helpers.ts";
import { type Instance, launchFresh, newCode, newPassword, strangerPool } from "./access.ts";
import { setUpByApi } from "./fresh-screen.ts";
import {
  newResetCode,
  ownerHashDigest,
  resetCall,
  resetEnv,
  setCookieLines,
  signInWith,
  spentCodes,
  storedSessions,
} from "./password.ts";

const TEST_TIMEOUT_MS = 300_000;

let fresh: Instance;
let password = newPassword();
let current = newResetCode();
const strangers = strangerPool();

test.describe.configure({ mode: "serial", timeout: TEST_TIMEOUT_MS });

test.beforeAll(async () => {
  const setup = newCode();
  fresh = launchFresh(setup, resetEnv(current));
  await setUpByApi(fresh.url, setup, password);
});

test.afterAll(async () => {
  await strangers.disposeAll();
  fresh.stop();
});

test.beforeEach(() => {
  fresh.sql("DELETE FROM throttles");
});

function useNewCode(): void {
  current = newResetCode();
  fresh.restart(resetEnv(current));
}

async function reset(next = newPassword()) {
  const stranger = await strangers.at(fresh.url);

  return resetCall(stranger, current, next);
}

test("a reset whose batch cannot finish changes nothing, leaves the code unspent and works on retry", async () => {
  const owner = await signInWith(fresh.url, password);
  const hashBefore = ownerHashDigest(fresh);
  const sessionsBefore = storedSessions(fresh);

  fresh.sql(
    "CREATE TRIGGER refuse_session_delete BEFORE DELETE ON sessions BEGIN SELECT RAISE(ABORT, 'session delete refused'); END",
  );

  try {
    expect((await reset()).status(), "a batch that cannot finish").toBe(500);
    expect(ownerHashDigest(fresh), "the password is the old one").toBe(hashBefore);
    expect(storedSessions(fresh), "the sessions are the old ones").toEqual(sessionsBefore);
    expect(spentCodes(fresh), "the code is unspent").toEqual([]);
    const stillIn = await owner.api.get("/api/items", { headers: owner.headers });
    expect(stillIn.status(), "the old session works").toBe(200);
  } finally {
    fresh.sql("DROP TRIGGER refuse_session_delete");
  }

  const next = newPassword();
  expect((await reset(next)).status(), "the retry").toBe(204);
  password = next;
  expect(spentCodes(fresh)).toEqual([sha256Hex(current)]);
});

test("a reset whose code was spent after its check gets 409 reset-used and changes nothing", async () => {
  useNewCode();
  const owner = await signInWith(fresh.url, password);
  const hashBefore = ownerHashDigest(fresh);
  const sessionsBefore = storedSessions(fresh);

  fresh.sql(
    `CREATE TRIGGER code_spent_elsewhere AFTER DELETE ON throttles WHEN OLD.kind = 'reset' BEGIN INSERT INTO spent_reset_codes (digest, spent_at) VALUES ('${sha256Hex(current)}', 1); END`,
  );

  try {
    await expectRefusal(await reset(), 409, "a reset that lost the race", "reset-used");
    expect(ownerHashDigest(fresh), "the password is the old one").toBe(hashBefore);
    expect(storedSessions(fresh), "the sessions are the old ones").toEqual(sessionsBefore);
    const stillIn = await owner.api.get("/api/items", { headers: owner.headers });
    expect(stillIn.status(), "the old session works").toBe(200);
  } finally {
    fresh.sql("DROP TRIGGER code_spent_elsewhere");
  }
});

test("two resets started together with the right code give one 204 and one reset-used", async () => {
  useNewCode();
  const answers = await Promise.all([reset(newPassword()), reset(newPassword())]);
  const statuses = answers.map((answer) => answer.status()).toSorted((a, b) => a - b);
  expect(statuses).toEqual([204, 409]);
  const refused = answers.find((answer) => answer.status() === 409);
  await expectRefusal(refused ?? answers[0], 409, "the second reset", "reset-used");
  expect(spentCodes(fresh)).toContain(sha256Hex(current));
  expect(storedSessions(fresh)).toEqual([]);
});

test("a login and a reset started together leave no session behind", async () => {
  useNewCode();
  const next = newPassword();
  const stranger = await strangers.at(fresh.url);

  const [login, done] = await Promise.all([
    stranger.post("/api/login", { data: { password } }),
    reset(next),
  ]);

  expect(done.status(), "the reset").toBe(204);
  expect([204, 401, 409], "the login lost to the reset or won before it").toContain(login.status());
  expect(storedSessions(fresh), "no session survives a reset").toEqual([]);
  const cookie = setCookieLines(login)[0]?.split(";")[0] ?? "";
  const probe = await stranger.get("/api/items", { headers: { cookie } });
  expect(probe.status(), "a cookie the login may have set").toBe(401);

  test.info().annotations.push({
    type: "concurrency",
    description:
      login.status() === 409
        ? "the login verified the old password and lost to the reset: 409 password-changed"
        : `the login answered ${login.status()}, so the requests did not overlap in this run`,
  });
});
