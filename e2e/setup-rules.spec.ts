import { type APIResponse, expect, test } from "@playwright/test";
import { z } from "zod";

import { cookieHeader, expectRefusal } from "./access-helpers.ts";
import { type Instance, launchFresh, newCode, sessionValueOf, strangerPool } from "./access.ts";
import { endLock } from "./fresh-screen.ts";

const LIGATURE_PASSWORD = `\uFB01${"x".repeat(12)}\u00E9`;
const OTHER_FORMS = [LIGATURE_PASSWORD.normalize("NFD"), LIGATURE_PASSWORD.normalize("NFKC")];
const WRONG_ATTEMPTS = 10;
const MAX_FIRST_LOCK_SECONDS = 60;
const BURST = 40;
const SECOND_LOCK_SECONDS = 120;

const Hash = z.array(z.object({ password_hash: z.string() }));
const Throttles = z.array(z.object({ kind: z.string() }));

let rules: Instance;
const strangers = strangerPool();
const code = newCode();

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  rules = launchFresh(code);
});

test.afterAll(async () => {
  await strangers.disposeAll();
  rules.stop();
});

async function send(
  method: "get" | "post",
  path: string,
  options: { data?: unknown; headers?: Record<string, string> } = {},
): Promise<APIResponse> {
  const stranger = await strangers.at(rules.url);

  return stranger[method](path, options);
}

function setupCall(
  path: "/api/setup/code" | "/api/setup",
  sent: string,
  password = "p".repeat(20),
) {
  return send("post", path, {
    data: path === "/api/setup" ? { code: sent, password } : { code: sent },
  });
}

function login(password: string): Promise<APIResponse> {
  return send("post", "/api/login", { data: { password } });
}

async function expectLocked(response: APIResponse, what: string): Promise<void> {
  await expectRefusal(response, 429, what, "locked");
  const seconds = Number(response.headers()["retry-after"]);
  expect(seconds, `${what}: Retry-After`).toBeGreaterThan(0);
  expect(seconds, `${what}: Retry-After`).toBeLessThanOrEqual(MAX_FIRST_LOCK_SECONDS);
}

test("a fresh Instance says setup, refuses a wrong code on both calls and moves on with the right one", async () => {
  const state = await send("get", "/api/session");
  expect(await state.json()).toEqual({ state: "setup", code: "set" });

  await expectRefusal(await setupCall("/api/setup/code", `${code}x`), 401, "a wrong code", "wrong");
  await expectRefusal(
    await setupCall("/api/setup", `${code}x`),
    401,
    "a wrong code with a password",
    "wrong",
  );
  expect((await setupCall("/api/setup/code", code)).status(), "the right code").toBe(204);
});

test("ten wrong codes, alternating between the two setup calls, lock both, and the lock survives a restart", async () => {
  for (let attempt = 0; attempt < WRONG_ATTEMPTS; attempt += 1) {
    const path = attempt % 2 === 0 ? "/api/setup/code" : "/api/setup";
    expect((await setupCall(path, `wrong-${attempt}`)).status(), `wrong code ${attempt}`).toBe(401);
  }

  for (const path of ["/api/setup/code", "/api/setup"] as const) {
    await expectLocked(await setupCall(path, code), `the right code on ${path}`);
    await expectLocked(await setupCall(path, "wrong-again"), `a wrong code on ${path}`);
  }

  rules.restart();
  await expectLocked(await setupCall("/api/setup/code", code), "the right code after a restart");

  endLock(rules, "setup");
  expect((await setupCall("/api/setup/code", code)).status(), "after the lock ends").toBe(204);
  const rows = rules.query("SELECT kind FROM throttles WHERE kind = 'setup'", Throttles);
  expect(rows, "a success resets the count").toEqual([]);
});

test("a password is counted after NFKC: 14 and 1,025 characters get 400, 14 that make 15 are accepted", async () => {
  await expectRefusal(
    await setupCall("/api/setup", code, "a".repeat(14)),
    400,
    "14 characters",
    "password-short",
  );
  await expectRefusal(
    await setupCall("/api/setup", code, "a".repeat(1025)),
    400,
    "1,025 characters",
    "password-long",
  );

  const created = await setupCall("/api/setup", code, LIGATURE_PASSWORD);
  expect(created.status(), "14 characters that are 15 after NFKC").toBe(204);
  const session = sessionValueOf(created.headers()["set-cookie"] ?? "");

  const state = await send("get", "/api/session", { headers: cookieHeader(session) });
  expect(await state.json()).toEqual({ state: "signed-in" });
  expect(await (await send("get", "/api/session")).json()).toEqual({ state: "signed-out" });
});

test("after setup both setup calls answer 409, the stored hash names its cost and other Unicode forms log in", async () => {
  for (const path of ["/api/setup/code", "/api/setup"] as const) {
    await expectRefusal(await setupCall(path, code), 409, `${path} after setup`, "owner-exists");
    await expectRefusal(
      await setupCall(path, "wrong"),
      409,
      `a wrong code on ${path} after setup`,
      "owner-exists",
    );
  }

  expect(
    await (await send("get", "/api/session")).json(),
    "no code field once an owner exists",
  ).toEqual({ state: "signed-out" });

  const [stored] = rules.query("SELECT password_hash FROM owner", Hash);
  expect(stored?.password_hash.startsWith("scrypt$N=32768$r=8$p=3$"), "N, r and p").toBe(true);

  for (const form of [LIGATURE_PASSWORD, ...OTHER_FORMS]) {
    expect((await login(form)).status(), "the same password in another form").toBe(204);
  }
});

test("ten wrong passwords lock login for everyone but sessions already open, and the lock survives a restart", async () => {
  const opened = sessionValueOf((await login(LIGATURE_PASSWORD)).headers()["set-cookie"] ?? "");

  for (let attempt = 0; attempt < WRONG_ATTEMPTS; attempt += 1) {
    await expectRefusal(
      await login(`wrong-password-${attempt}`),
      401,
      `wrong password ${attempt}`,
      "wrong",
    );
  }

  await expectLocked(await login("wrong-password-again"), "an eleventh wrong password");
  await expectLocked(await login(LIGATURE_PASSWORD), "the right password while locked");
  const open = await send("get", "/api/items", { headers: cookieHeader(opened) });
  expect(open.status(), "an open session keeps working").toBe(200);

  rules.restart();
  await expectLocked(await login(LIGATURE_PASSWORD), "the right password after a restart");

  await endLockAndSignIn();
});

async function endLockAndSignIn(): Promise<void> {
  endLock(rules, "login");
  expect((await login(LIGATURE_PASSWORD)).status(), "the right password after the lock").toBe(204);
}

test("forty wrong passwords sent at once: ten are checked and the other thirty get 429", async () => {
  const answers = await Promise.all(
    Array.from({ length: BURST }, (_, attempt) => login(`burst-${attempt}`)),
  );

  const statuses = answers.map((answer) => answer.status());

  expect(statuses.filter((status) => status === 401)).toHaveLength(WRONG_ATTEMPTS);
  expect(statuses.filter((status) => status === 429)).toHaveLength(BURST - WRONG_ATTEMPTS);
  await expectLocked(await login(LIGATURE_PASSWORD), "the right password after the burst");
  await endLockAndSignIn();
});

test("a wrong password after a lock ends doubles the next lock", async () => {
  for (let attempt = 0; attempt < WRONG_ATTEMPTS; attempt += 1) {
    expect((await login(`first-lock-${attempt}`)).status(), `wrong password ${attempt}`).toBe(401);
  }

  endLock(rules, "login");
  await expectRefusal(await login("after-the-first-lock"), 401, "a wrong password", "wrong");
  const second = await login(LIGATURE_PASSWORD);
  await expectRefusal(second, 429, "the right password in the second lock", "locked");
  const seconds = Number(second.headers()["retry-after"]);
  expect(seconds, "the second lock is longer than the first").toBeGreaterThan(
    MAX_FIRST_LOCK_SECONDS,
  );
  expect(seconds, "the second lock doubles the first").toBeLessThanOrEqual(SECOND_LOCK_SECONDS);
  await endLockAndSignIn();
});
