import { expect, test } from "@playwright/test";

import { DAY_MS, expectRefusal, sha256Hex } from "./access-helpers.ts";
import { type Instance, launchFresh, newCode, newPassword, strangerPool } from "./access.ts";
import { setUpByApi } from "./fresh-screen.ts";
import {
  addMovingTrigger,
  changeCall,
  ownerHashDigest,
  setCookieLines,
  signInWith,
  storedSessions,
} from "./password.ts";

const TEST_TIMEOUT_MS = 240_000;
const RACE_ROUNDS = 5;
const SESSION_COOKIE_START = "__Host-threadsift_session=";

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

function cookieValueOf(lines: readonly string[]): string {
  const line = lines.find((entry) => entry.startsWith(SESSION_COOKIE_START)) ?? "";

  return line.slice(SESSION_COOKIE_START.length).split(";")[0] ?? "";
}

test("a login that verified a password the database no longer holds gets 409 and starts no session", async () => {
  const stranger = await strangers.at(fresh.url);
  const sessionsBefore = storedSessions(fresh);
  const restore = addMovingTrigger(fresh);

  try {
    const login = await stranger.post("/api/login", { data: { password } });
    await expectRefusal(login, 409, "a login that lost the race", "password-changed");
    expect(setCookieLines(login), "no cookie").toEqual([]);
    expect(storedSessions(fresh), "no session was started").toEqual(sessionsBefore);
  } finally {
    restore();
  }

  expect((await signInWith(fresh.url, password)).value, "the password still works").not.toBe("");
});

test("a change that verified a password the database no longer holds gets 409 and writes nothing", async () => {
  const owner = await signInWith(fresh.url, password);
  const next = newPassword();
  const sessionsBefore = storedSessions(fresh);
  const restore = addMovingTrigger(fresh);

  try {
    const change = await changeCall(owner.api, owner.headers, password, next);
    await expectRefusal(change, 409, "a change that lost the race", "password-changed");
    expect(setCookieLines(change), "no cookie").toEqual([]);
    expect(storedSessions(fresh), "no session ended or started").toEqual(sessionsBefore);
  } finally {
    restore();
  }

  const again = await changeCall(owner.api, owner.headers, password, next);
  expect(again.status(), "the same change once the password stopped moving").toBe(204);
  password = next;
  await owner.api.dispose();
});

test("a login that verified before a reset-like change of the password and its sessions starts no session", async () => {
  const stranger = await strangers.at(fresh.url);
  const restore = addMovingTrigger(fresh, " DELETE FROM sessions;");

  try {
    const login = await stranger.post("/api/login", { data: { password } });
    await expectRefusal(login, 409, "a login that lost to a reset", "password-changed");
    expect(storedSessions(fresh), "no session survived").toEqual([]);
  } finally {
    restore();
  }

  expect((await signInWith(fresh.url, password)).value).not.toBe("");
});

async function raceTwoChanges(current: string) {
  const owner = await signInWith(fresh.url, current);
  const nexts = [newPassword(), newPassword()] as const;

  const answers = await Promise.all(
    nexts.map((next) => changeCall(owner.api, owner.headers, current, next)),
  );

  await owner.api.dispose();
  const statuses = answers.map((answer) => answer.status()).toSorted((a, b) => a - b);
  const won = answers.findIndex((answer) => answer.status() === 204);
  const winner = answers[won];

  if (winner === undefined) {
    throw new Error(`neither change won: ${statuses.join(", ")}`);
  }

  return {
    statuses,
    password: nexts[won] ?? current,
    value: cookieValueOf(setCookieLines(winner)),
  };
}

test("two changes started together leave one password and one session", async () => {
  let overlapped = false;

  for (let round = 0; round < RACE_ROUNDS && !overlapped; round += 1) {
    const raced = await raceTwoChanges(password);
    expect(raced.statuses[1], "the other change is refused").not.toBe(204);
    overlapped = raced.statuses[1] === 409;
    password = raced.password;
    expect(storedSessions(fresh), "only the winner's session exists").toEqual([
      sha256Hex(raced.value),
    ]);
  }

  test.info().annotations.push({
    type: "concurrency",
    description: overlapped
      ? "both requests verified the same old password; the loser got 409 password-changed"
      : "no request overlapped in this run, so this was a concurrency smoke test",
  });
});

function ageSession(value: string): void {
  fresh.sql(
    `UPDATE sessions SET expires_at = ${Date.now() + 10 * DAY_MS} WHERE digest = '${sha256Hex(value)}'`,
  );
}

test("a change from a session old enough to be renewed sets one cookie, and a failed batch leaves everything as it was", async () => {
  const owner = await signInWith(fresh.url, password);
  const stranger = await strangers.at(fresh.url);
  ageSession(owner.value);
  const hashBefore = ownerHashDigest(fresh);
  const sessionsBefore = storedSessions(fresh);
  const next = newPassword();

  fresh.sql(
    "CREATE TRIGGER refuse_session_write BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT, 'session write refused'); END",
  );

  try {
    const failed = await changeCall(owner.api, owner.headers, password, next);
    expect(failed.status(), "a batch that cannot finish").toBe(500);
    expect(ownerHashDigest(fresh), "the password is the old one").toBe(hashBefore);
    expect(storedSessions(fresh), "the sessions are the old ones").toEqual(sessionsBefore);
    const stillIn = await stranger.get("/api/items", { headers: owner.headers });
    expect(stillIn.status(), "the old session still works").toBe(200);
  } finally {
    fresh.sql("DROP TRIGGER refuse_session_write");
  }

  ageSession(owner.value);
  const retry = await changeCall(owner.api, owner.headers, password, next);
  expect(retry.status(), "the retry once the trigger is gone").toBe(204);
  password = next;
  const cookies = setCookieLines(retry).filter((line) => line.startsWith(SESSION_COOKIE_START));
  expect(cookies, "one session cookie, not the renewal and the new one").toHaveLength(1);
  expect(cookieValueOf(cookies)).not.toBe(owner.value);
  expect(storedSessions(fresh)).toEqual([sha256Hex(cookieValueOf(cookies))]);
  await owner.api.dispose();
});

test("a session revoked after the guard let the call in gets 409 while the password is unchanged", async () => {
  const owner = await signInWith(fresh.url, password);
  const hashBefore = ownerHashDigest(fresh);
  const next = newPassword();

  fresh.sql(
    "CREATE TRIGGER session_revoked AFTER DELETE ON throttles WHEN OLD.kind = 'login' BEGIN DELETE FROM sessions; END",
  );

  try {
    const change = await changeCall(owner.api, owner.headers, password, next);
    await expectRefusal(change, 409, "a change whose session ended mid-call", "password-changed");
    expect(setCookieLines(change), "no cookie").toEqual([]);
    expect(ownerHashDigest(fresh), "the password is the old one").toBe(hashBefore);
    expect(storedSessions(fresh), "no session was started").toEqual([]);
  } finally {
    fresh.sql("DROP TRIGGER session_revoked");
  }

  expect((await signInWith(fresh.url, password)).value, "the old password works").not.toBe("");
  await owner.api.dispose();
});
