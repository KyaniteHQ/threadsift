import { expect } from "@playwright/test";
import { z } from "zod";

import { DAY_MS, ErrorBody, MAX_AGE, expectRefusal, sha256Hex, signIn } from "./access-helpers.ts";
import {
  SAME_ORIGIN,
  SESSION_COOKIE,
  mainInstance,
  ownerPassword,
  sessionValueOf,
  test,
} from "./access.ts";

const Sessions = z.array(z.object({ digest: z.string(), expires_at: z.number() }));

function storedSessions() {
  return mainInstance().query("SELECT digest, expires_at FROM sessions", Sessions);
}

function expiryOf(digest: string): number | undefined {
  return storedSessions().find((row) => row.digest === digest)?.expires_at;
}

test("login sets a __Host- cookie for 30 days and the sessions table holds only a digest", async ({
  stranger,
}) => {
  const wrong = await stranger.post("/api/login", { data: { password: `${ownerPassword()}x` } });
  await expectRefusal(wrong, 401, "a wrong password");

  const right = await stranger.post("/api/login", { data: { password: ownerPassword() } });
  expect(right.status()).toBe(204);
  const setCookie = right.headers()["set-cookie"] ?? "";
  const value = sessionValueOf(setCookie);
  expect(setCookie.startsWith(`${SESSION_COOKIE}=`)).toBe(true);

  for (const attribute of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/", `Max-Age=${MAX_AGE}`]) {
    expect(setCookie, "Set-Cookie attributes").toContain(attribute);
  }

  expect(setCookie).not.toMatch(/Domain=/iu);
  const digests = storedSessions().map((row) => row.digest);
  expect(digests).toContain(sha256Hex(value));
  expect(digests, "no raw session id is stored").not.toContain(value);
});

test("a wrong password always gets the same message", async ({ stranger }) => {
  const messages = new Set<string>();

  for (const suffix of ["a", "b"]) {
    const response = await stranger.post("/api/login", {
      data: { password: `${ownerPassword()}${suffix}` },
    });

    messages.add(ErrorBody.parse(await response.json()).error);
  }

  expect(messages.size).toBe(1);
});

test("after logout the old cookie gets 401 and its row is gone", async ({ baseURL }) => {
  const { value, headers, api } = await signIn(baseURL ?? "");

  expect((await api.get("/api/items", { headers })).status()).toBe(200);
  const loggedOut = await api.post("/api/logout", { headers: { ...headers, ...SAME_ORIGIN } });
  expect(loggedOut.status()).toBe(204);
  expect(loggedOut.headers()["set-cookie"] ?? "").toContain("Max-Age=0");
  await expectRefusal(await api.get("/api/items", { headers }), 401, "the old cookie");
  expect(expiryOf(sha256Hex(value)), "the session row is deleted").toBeUndefined();
  await api.dispose();
});

test("a session extends at most once a day and sends its cookie again, and an expired one is refused", async ({
  baseURL,
}) => {
  const { value, headers, api } = await signIn(baseURL ?? "");
  const digest = sha256Hex(value);
  const instance = mainInstance();

  const move = (to: number) => {
    instance.sql(`UPDATE sessions SET expires_at = ${to} WHERE digest = '${digest}'`);
  };

  const fresh = await api.get("/api/items", { headers });
  expect(fresh.headers()["set-cookie"], "a new session writes nothing").toBeUndefined();

  move(Date.now() + 10 * DAY_MS);
  const renewed = await api.get("/api/items", { headers });
  expect(renewed.status()).toBe(200);
  const cookie = renewed.headers()["set-cookie"] ?? "";
  expect(cookie, "the cookie is sent again").toContain(`Max-Age=${MAX_AGE}`);
  expect(sessionValueOf(cookie)).toBe(value);
  expect(expiryOf(digest) ?? 0).toBeGreaterThan(Date.now() + 29 * DAY_MS);

  const quiet = await api.get("/api/items", { headers });
  expect(quiet.headers()["set-cookie"], "a second call within a day").toBeUndefined();

  move(Date.now() - 1000);
  await expectRefusal(await api.get("/api/items", { headers }), 401, "an expired session");
  expect(expiryOf(digest), "the expired row is deleted").toBeUndefined();
  await api.dispose();
});
