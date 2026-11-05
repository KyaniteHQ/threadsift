import { type APIRequestContext, type APIResponse, expect, test } from "@playwright/test";
import { z } from "zod";

import { LOGIN } from "../web/src/access-text.ts";
import { cookieHeader, expectRefusal } from "./access-helpers.ts";
import { type Instance, anonymous, launchFresh, newCode, sessionValueOf } from "./access.ts";
import { passwordField } from "./setup-screens.ts";

const LIGATURE_PASSWORD = `\uFB01${"x".repeat(12)}\u00E9`;
const OTHER_FORMS = [LIGATURE_PASSWORD.normalize("NFD"), LIGATURE_PASSWORD.normalize("NFKC")];
const WRONG_ATTEMPTS = 10;
const MAX_FIRST_LOCK_SECONDS = 60;

const Hash = z.array(z.object({ password_hash: z.string() }));
const Throttles = z.array(z.object({ kind: z.string() }));

let rules: Instance;
const strangers: APIRequestContext[] = [];
const code = newCode();

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  rules = launchFresh(code);
});

test.afterAll(async () => {
  await Promise.all(strangers.map((stranger) => stranger.dispose()));
  rules.stop();
});

async function send(
  method: "get" | "post",
  path: string,
  options: { data?: unknown; headers?: Record<string, string> } = {},
): Promise<APIResponse> {
  const stranger = await anonymous(rules.url);
  strangers.push(stranger);

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

function expectLocked(response: APIResponse, what: string): void {
  expect(response.status(), what).toBe(429);
  const seconds = Number(response.headers()["retry-after"]);
  expect(seconds, `${what}: Retry-After`).toBeGreaterThan(0);
  expect(seconds, `${what}: Retry-After`).toBeLessThanOrEqual(MAX_FIRST_LOCK_SECONDS);
}

test("a fresh Instance says setup, refuses a wrong code on both calls and moves on with the right one", async () => {
  const state = await send("get", "/api/session");
  expect(await state.json()).toEqual({ state: "setup", code: "set" });

  await expectRefusal(await setupCall("/api/setup/code", `${code}x`), 401, "a wrong code");
  await expectRefusal(
    await setupCall("/api/setup", `${code}x`),
    401,
    "a wrong code with a password",
  );
  expect((await setupCall("/api/setup/code", code)).status(), "the right code").toBe(204);
});

test("ten wrong codes, alternating between the two setup calls, lock both, and the lock survives a restart", async () => {
  for (let attempt = 0; attempt < WRONG_ATTEMPTS; attempt += 1) {
    const path = attempt % 2 === 0 ? "/api/setup/code" : "/api/setup";
    expect((await setupCall(path, `wrong-${attempt}`)).status(), `wrong code ${attempt}`).toBe(401);
  }

  for (const path of ["/api/setup/code", "/api/setup"] as const) {
    expectLocked(await setupCall(path, code), `the right code on ${path}`);
    expectLocked(await setupCall(path, "wrong-again"), `a wrong code on ${path}`);
  }

  rules.restart();
  expectLocked(await setupCall("/api/setup/code", code), "the right code after a restart");

  rules.sql("UPDATE throttles SET locked_until = 0 WHERE kind = 'setup'");
  expect((await setupCall("/api/setup/code", code)).status(), "after the lock ends").toBe(204);
  const rows = rules.query("SELECT kind FROM throttles WHERE kind = 'setup'", Throttles);
  expect(rows, "a success resets the count").toEqual([]);
});

test("a password is counted after NFKC: 14 and 1,025 characters get 400, 14 that make 15 are accepted", async () => {
  await expectRefusal(await setupCall("/api/setup", code, "a".repeat(14)), 400, "14 characters");
  await expectRefusal(
    await setupCall("/api/setup", code, "a".repeat(1025)),
    400,
    "1,025 characters",
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
    await expectRefusal(await setupCall(path, code), 409, `${path} after setup`);
    await expectRefusal(await setupCall(path, "wrong"), 409, `a wrong code on ${path} after setup`);
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
    expect((await login(`wrong-password-${attempt}`)).status(), `wrong password ${attempt}`).toBe(
      401,
    );
  }

  expectLocked(await login("wrong-password-again"), "an eleventh wrong password");
  expectLocked(await login(LIGATURE_PASSWORD), "the right password while locked");
  const open = await send("get", "/api/items", { headers: cookieHeader(opened) });
  expect(open.status(), "an open session keeps working").toBe(200);

  rules.restart();
  expectLocked(await login(LIGATURE_PASSWORD), "the right password after a restart");

  rules.sql("UPDATE throttles SET locked_until = 0 WHERE kind = 'login'");
  expect((await login(LIGATURE_PASSWORD)).status(), "after the lock ends").toBe(204);
});

test("the sign-in screen says when to try again while login is locked and sends nothing more", async ({
  page,
}) => {
  for (let attempt = 0; attempt < WRONG_ATTEMPTS; attempt += 1) {
    expect((await login(`wrong-again-${attempt}`)).status(), `wrong password ${attempt}`).toBe(401);
  }

  await page.goto(rules.url);
  await passwordField(page).fill(LIGATURE_PASSWORD);
  await page.getByRole("button", { name: LOGIN.signIn }).click();
  await expect(page.getByRole("alert")).toHaveText(
    /^Too many wrong tries, so wait .+ before trying again\.$/u,
  );
  await expect(page.getByRole("button", { name: LOGIN.signIn })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});
