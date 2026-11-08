import { expect, test } from "@playwright/test";

import { CreatedToken, sha256Hex } from "./access-helpers.ts";
import { SAME_ORIGIN, anonymous, bearer } from "./access.ts";
import { AI_SETTINGS_ENDPOINT } from "./ai.ts";
import {
  CALLBACK,
  FAKE_CODE,
  type ConnectScreen,
  attemptCount,
  callback,
  callbackFor,
  connectScreen,
  expectNotice,
  expectPrivate,
  jobRows,
  revisionOf,
  settingsRows,
  signedIn,
  startAs,
  started,
  verifierOf,
} from "./connect.ts";
import { sweepNow } from "./ingest.ts";
import type { Signed } from "./password.ts";

test.describe.configure({ mode: "serial", timeout: 240_000 });

test("Only the session that started an attempt can consume it, and a code OpenRouter refuses saves nothing", async ({
  browser,
}) => {
  const screen = await connectScreen(browser);
  const owner = await signedIn(screen);
  const other = await signedIn(screen);

  try {
    const { state } = await started(await startAs(owner, screen));
    const verifier = verifierOf(screen, state);

    expectNotice(await callback(other, callbackFor(state)), "incomplete");
    expect(attemptCount(screen), "another session leaves the attempt alone").toBe(1);

    expectNotice(await callback(owner, callbackFor(state)), "incomplete");
    expect(attemptCount(screen), "the owning session's callback consumes it").toBe(0);
    expect(settingsRows(screen), "a refused code saves nothing").toBe(0);
    expect(jobRows(screen), "and opens no Digest job").toBe(0);
    expect(revisionOf(screen), "and does not advance the revision").toBe(0);

    expectNotice(await callback(owner, callbackFor(state)), "incomplete");

    const logs = screen.fresh.logs();
    expect(logs).not.toContain(FAKE_CODE);
    expect(logs).not.toContain(verifier);
    expect(logs).not.toContain(state);
  } finally {
    await other.api.dispose();
    await owner.api.dispose();
    await screen.close();
  }
});

async function expectUnusableCallbacks(
  screen: Readonly<ConnectScreen>,
  owner: Readonly<Signed>,
  state: string,
): Promise<void> {
  const addresses = [
    ["no code", `${CALLBACK}?state=${state}`],
    ["no state", `${CALLBACK}?code=${FAKE_CODE}`],
    ["no parameters", CALLBACK],
    ["two states", `${callbackFor(state)}&state=${state}`],
    ["two codes", `${callbackFor(state)}&code=${FAKE_CODE}`],
    ["an error beside a code", `${callbackFor(state)}&error=access_denied`],
    ["an error and a state", `${CALLBACK}?error=access_denied&state=${state}`],
    ["a state of the wrong length", callbackFor("short")],
    ["a state nobody started", callbackFor("a".repeat(43))],
  ] as const;

  for (const [what, address] of addresses) {
    expectNotice(await callback(owner, address), "incomplete");
    expect(attemptCount(screen), `${what} leaves the attempt`).toBe(1);
  }

  const head = await owner.api.head(callbackFor(state), {
    headers: owner.headers,
    maxRedirects: 0,
  });

  expect(head.status(), "HEAD").toBe(405);
  expectPrivate(head);
  expect(attemptCount(screen), "HEAD leaves the attempt").toBe(1);
}

async function expectRefusedCallers(
  screen: Readonly<ConnectScreen>,
  owner: Readonly<Signed>,
  state: string,
): Promise<void> {
  const stranger = await anonymous(screen.origin);

  try {
    const client = await stranger.get(callbackFor(state), { maxRedirects: 0 });
    expect(client.status(), "a signed-out client that is not navigating").toBe(401);
    expectPrivate(client);

    const signedOut = await callback({ api: stranger }, callbackFor(state));

    expect(signedOut.status(), "signed out").toBe(303);
    expect(signedOut.headers()["location"], "a signed-out browser leaves the address").toBe(
      "/settings",
    );

    expectPrivate(signedOut);

    const created = await owner.api.post("/api/tokens", {
      data: { name: "connect-callback" },
      headers: owner.headers,
    });

    const token = CreatedToken.parse(await created.json());

    for (const [what, value, status] of [
      ["an agent token", token.value, 403],
      ["an unknown token", "tsa_unknown", 401],
    ] as const) {
      const response = await stranger.get(callbackFor(state), {
        headers: bearer(value),
        maxRedirects: 0,
      });

      expect(response.status(), what).toBe(status);
      expectPrivate(response);
    }
  } finally {
    await stranger.dispose();
  }
}

test("A callback with a missing, repeated or conflicting parameter, a HEAD request, or a caller who is not the owner's browser exchanges nothing and changes nothing", async ({
  browser,
}) => {
  const screen = await connectScreen(browser);
  const owner = await signedIn(screen);

  try {
    const { state } = await started(await startAs(owner, screen));

    await expectUnusableCallbacks(screen, owner, state);
    await expectRefusedCallers(screen, owner, state);

    expect(attemptCount(screen)).toBe(1);
    expect(settingsRows(screen)).toBe(0);
    expect(jobRows(screen)).toBe(0);
  } finally {
    await owner.api.dispose();
    await screen.close();
  }
});

test("An expired attempt is refused, and the sweep removes it and the attempts of an expired session", async ({
  browser,
}) => {
  const screen = await connectScreen(browser);
  const owner = await signedIn(screen);
  const second = await signedIn(screen);

  try {
    const { state } = await started(await startAs(owner, screen));
    await started(await startAs(second, screen, { model: "other", revision: 0 }));
    expect(attemptCount(screen)).toBe(2);

    screen.fresh.sql(
      `UPDATE openrouter_connect_transactions SET expires_at = created_at + 1 WHERE state_digest = '${sha256Hex(state)}'`,
    );

    expectNotice(await callback(owner, callbackFor(state)), "incomplete");
    expect(attemptCount(screen), "an expired attempt is refused before any cleanup").toBe(2);

    screen.fresh.sql(
      `UPDATE sessions SET expires_at = 1 WHERE digest = '${sha256Hex(second.value)}'`,
    );
    expect(attemptCount(screen), "an expired session's attempt waits for the sweep").toBe(2);

    await sweepNow(owner.api, screen.fresh);
    await expect.poll(() => attemptCount(screen), { timeout: 90_000 }).toBe(0);
  } finally {
    await second.api.dispose();
    await owner.api.dispose();
    await screen.close();
  }
});

test("Signing out and changing the password end the attempts of the sessions they end", async ({
  browser,
}) => {
  const screen = await connectScreen(browser);
  const owner = await signedIn(screen);
  const second = await signedIn(screen);

  try {
    const { state: secondState } = await started(
      await startAs(second, screen, { model: "second", revision: 0 }),
    );

    await started(await startAs(owner, screen));
    expect(attemptCount(screen)).toBe(2);

    const out = await second.api.post("/api/logout", {
      headers: { ...second.headers, ...SAME_ORIGIN },
    });

    expect(out.status()).toBe(204);
    expect(attemptCount(screen), "signing out removes that session's attempt").toBe(1);

    const afterLogout = await callback(second, callbackFor(secondState));
    expect(afterLogout.status()).toBe(303);
    expect(afterLogout.headers()["location"]).toBe("/settings");

    const change = await owner.api.post("/api/password", {
      data: { current: screen.password, password: `${screen.password}-changed` },
      headers: { ...owner.headers, ...SAME_ORIGIN },
    });

    expect(change.status(), "password change").toBe(204);
    expect(attemptCount(screen), "a password change ends every session's attempts").toBe(0);
  } finally {
    await second.api.dispose();
    await owner.api.dispose();
    await screen.close();
  }
});

test("A typed Save advances the revision and supersedes an older attempt, which exchanges nothing", async ({
  browser,
}) => {
  const screen = await connectScreen(browser);
  const owner = await signedIn(screen);

  try {
    const { state } = await started(await startAs(owner, screen));
    expect(revisionOf(screen)).toBe(0);

    const typed = {
      provider: "openai-compatible",
      baseUrl: "https://example.com",
      model: "typed",
      key: "typed-key-proof",
    } as const;

    const save = () => owner.api.put(AI_SETTINGS_ENDPOINT, { data: typed, headers: owner.headers });

    expect((await save()).status()).toBe(200);
    expect(revisionOf(screen), "a Save advances the revision").toBe(1);
    expect((await save()).status()).toBe(200);
    expect(revisionOf(screen), "a Save of the same values advances it too").toBe(2);

    expectNotice(await callback(owner, callbackFor(state)), "settings-changed");
    expect(attemptCount(screen), "the superseded attempt is not consumed").toBe(1);
    expect(settingsRows(screen)).toBe(1);

    const stale = await startAs(owner, screen, { model: "again", revision: 0 });
    expect(stale.status(), "a page that shows the older revision").toBe(409);
    expect(attemptCount(screen)).toBe(1);

    await started(await startAs(owner, screen, { model: "again", revision: 2 }));
    expect(attemptCount(screen), "a page that shows the current revision").toBe(2);
  } finally {
    await owner.api.dispose();
    await screen.close();
  }
});
