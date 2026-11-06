import { expect, test } from "@playwright/test";

import { ErrorResponseSchema } from "../src/http/schemas.ts";
import { expectRefusal, sha256Hex } from "./access-helpers.ts";
import { type Instance, launchFresh, newCode, newPassword, strangerPool } from "./access.ts";
import { setUpByApi } from "./fresh-screen.ts";
import {
  addMovingTrigger,
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

test("a reset that read a password a change then replaced gets 409 password-changed and spends nothing", async () => {
  useNewCode();
  const owner = await signInWith(fresh.url, password);
  const sessionsBefore = storedSessions(fresh);
  const restore = addMovingTrigger(fresh, "", "reset");
  const hashBefore = ownerHashDigest(fresh);

  try {
    await expectRefusal(await reset(), 409, "a reset that lost to a change", "password-changed");
    expect(ownerHashDigest(fresh), "the change's hash was not overwritten").not.toBe(hashBefore);
    expect(spentCodes(fresh), "the code is unspent").not.toContain(sha256Hex(current));
    expect(storedSessions(fresh), "the sessions are as they were").toEqual(sessionsBefore);
    const stillIn = await owner.api.get("/api/items", { headers: owner.headers });
    expect(stillIn.status(), "the session works").toBe(200);
  } finally {
    restore();
  }

  const next = newPassword();
  expect((await reset(next)).status(), "the same code once the password stopped moving").toBe(204);
  password = next;
  await owner.api.dispose();
});

test("two resets started together with the right code give one 204 and one reset-used", async () => {
  useNewCode();
  const passwords = [newPassword(), newPassword()] as const;
  const answers = await Promise.all(passwords.map((next) => reset(next)));
  const statuses = answers.map((answer) => answer.status()).toSorted((a, b) => a - b);
  expect(statuses[0], "one reset won").toBe(204);
  expect(statuses[1], "the other was refused").toBe(409);
  const won = answers.findIndex((answer) => answer.status() === 204);
  const refused = answers[won === 0 ? 1 : 0];
  const body = ErrorResponseSchema.parse(await refused?.json());
  expect(["reset-used", "password-changed"], "why the second reset lost").toContain(body.code);
  password = passwords[won] ?? password;
  expect(spentCodes(fresh)).toContain(sha256Hex(current));
  expect(storedSessions(fresh)).toEqual([]);
  expect((await signInWith(fresh.url, password)).value, "the winner's password works").not.toBe("");
});

test("a login and a reset started together leave no session behind", async () => {
  useNewCode();
  const next = newPassword();
  const stranger = await strangers.at(fresh.url);
  expect((await signInWith(fresh.url, password)).value, "the login works before the race").not.toBe(
    "",
  );

  const [login, done] = await Promise.all([
    stranger.post("/api/login", { data: { password } }),
    reset(next),
  ]);

  expect(done.status(), "the reset").toBe(204);
  password = next;
  expect([204, 401, 409], "the login won before the reset, or lost to it").toContain(
    login.status(),
  );
  expect(storedSessions(fresh), "no session survives a reset").toEqual([]);
  const cookie = setCookieLines(login)[0]?.split(";")[0] ?? "";
  const probe = await stranger.get("/api/items", { headers: { cookie } });
  expect(probe.status(), "a cookie the login may have set").toBe(401);

  test.info().annotations.push({
    type: "concurrency",
    description:
      login.status() === 409
        ? "the login verified the old password and lost to the reset: 409 password-changed"
        : `the login answered ${login.status()}, so the requests did not overlap in this run: a concurrency smoke test`,
  });
});
