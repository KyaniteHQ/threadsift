import { createHash } from "node:crypto";

import { type APIResponse, expect, test } from "@playwright/test";

import { AiSaveResponseSchema, AiSettingsViewSchema } from "../src/core/ai-contract.ts";
import { AI_TEXT } from "../web/src/ai-text.ts";
import { CreatedToken, sha256Hex } from "./access-helpers.ts";
import { SAME_ORIGIN, anonymous, bearer } from "./access.ts";
import { AI_SETTINGS_ENDPOINT, aiJson, aiScreen, newSealingKey, putSettings } from "./ai.ts";
import {
  CALLBACK,
  CONNECT_LIFETIME_MS,
  FIRST_START,
  MODEL,
  START,
  type ConnectScreen,
  type StartBody,
  attemptCount,
  attempts,
  connectScreen,
  expectPrivate,
  ownPage,
  signedIn,
  startAs,
  verifierOf,
} from "./connect.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { storedSessions, type Signed } from "./password.ts";

test.describe.configure({ mode: "serial", timeout: 240_000 });

function aiSection(screen: Readonly<FreshScreen>) {
  return screen.page.getByRole("region", { name: AI_TEXT.title, exact: true });
}

async function leaveForOpenRouter(screen: Readonly<ConnectScreen>): Promise<URL> {
  const { page } = screen;
  await page.goto("/settings");
  const section = aiSection(screen);
  await section.getByLabel(AI_TEXT.provider, { exact: true }).selectOption("openrouter");

  const connect = section.getByRole("button", { name: AI_TEXT.connect, exact: true });
  await connect.click();
  await expect(section.getByText(AI_TEXT.connectModelNeeded, { exact: true })).toBeVisible();
  expect(attemptCount(screen), "no attempt without a model").toBe(0);

  await section.getByLabel(AI_TEXT.model, { exact: true }).fill(MODEL);
  await expect(section.getByLabel(AI_TEXT.key, { exact: true })).toHaveValue("");

  const leaving = page.waitForRequest((request) =>
    request.url().startsWith("https://openrouter.ai/auth?"),
  );

  await connect.click();

  return new URL((await leaving).url());
}

function expectBoundAttempt(screen: Readonly<ConnectScreen>, url: Readonly<URL>) {
  const state = url.searchParams.get("state") ?? "";
  expect(state).toMatch(/^[\w-]{43}$/u);

  const [attempt, ...others] = attempts(screen);
  expect(others, "one attempt").toEqual([]);
  expect(attempt?.state_digest).toBe(sha256Hex(state));
  expect(attempt?.model).toBe(MODEL);
  expect(attempt?.expected_revision).toBe(0);
  expect(attempt?.public_origin).toBe(screen.origin);
  expect((attempt?.expires_at ?? 0) - (attempt?.created_at ?? 0)).toBe(CONNECT_LIFETIME_MS);
  expect(attempt?.sealed_verifier.startsWith("v1.")).toBe(true);
  expect(storedSessions(screen.fresh)).toContain(attempt?.session_digest);

  const verifier = verifierOf(screen, state);
  expect(verifier).toMatch(/^[\w-]{43}$/u);
  expect(verifier).not.toBe(state);

  expect(url.searchParams.get("code_challenge")).toBe(
    createHash("sha256").update(verifier).digest("base64url"),
  );

  return { attempt, state, verifier };
}

test("Connect leaves for OpenRouter with a sealed attempt bound to the model, revision and origin, and the attempt survives a restart", async ({
  browser,
}) => {
  const screen = await connectScreen(browser);

  try {
    const url = await leaveForOpenRouter(screen);

    expect(url.searchParams.get("callback_url")).toBe(`${screen.origin}${CALLBACK}`);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("key_label")).toBe("Threadsift");
    const { attempt, state, verifier } = expectBoundAttempt(screen, url);

    screen.fresh.restart();
    expect(attempts(screen), "the attempt survives a restart").toEqual([attempt]);
    expect(screen.fresh.logs()).not.toContain(verifier);
    expect(screen.fresh.logs()).not.toContain(state);
  } finally {
    await screen.close();
  }
});

type Sender = (
  headers: Readonly<Record<string, string>>,
  data: string | StartBody,
) => Promise<APIResponse>;

function refusals(screen: Readonly<ConnectScreen>, token: string) {
  const own = ownPage(screen.origin);
  const empty = { model: "   ", revision: 0 };
  const negative = { model: MODEL, revision: -1 };

  return [
    ["an agent token", { ...own, ...bearer(token) }, FIRST_START, 403, "stranger"],
    [
      "a foreign Origin",
      { ...SAME_ORIGIN, origin: "https://threadsift.invalid" },
      FIRST_START,
      403,
      "owner",
    ],
    ["a foreign Host", { ...own, host: "threadsift.invalid" }, FIRST_START, 403, "owner"],
    ["Origin null", { ...SAME_ORIGIN, origin: "null" }, FIRST_START, 403, "owner"],
    ["no Origin", SAME_ORIGIN, FIRST_START, 403, "owner"],
    ["no Sec-Fetch-Site", { origin: screen.origin }, FIRST_START, 403, "owner"],
    [
      "Sec-Fetch-Site cross-site",
      { origin: screen.origin, "sec-fetch-site": "cross-site" },
      FIRST_START,
      403,
      "owner",
    ],
    [
      "a body that is not JSON",
      { ...own, "content-type": "text/plain" },
      JSON.stringify(FIRST_START),
      415,
      "owner",
    ],
    ["an empty model", own, empty, 400, "owner"],
    ["a negative revision", own, negative, 400, "owner"],
    ["a signed-out caller", own, FIRST_START, 401, "stranger"],
  ] as const;
}

function senders(owner: Readonly<Signed>, stranger: Awaited<ReturnType<typeof anonymous>>) {
  return {
    owner: (headers, data) =>
      owner.api.post(START, { data, headers: { ...owner.headers, ...headers } }),
    stranger: (headers, data) => stranger.post(START, { data, headers }),
  } satisfies Record<"owner" | "stranger", Sender>;
}

test("Start refuses a signed-out caller, an agent token and a request that is not from the Instance's own page, and records nothing", async ({
  browser,
}) => {
  const screen = await connectScreen(browser);
  const stranger = await anonymous(screen.origin);
  const owner = await signedIn(screen);

  try {
    const created = await owner.api.post("/api/tokens", {
      data: { name: "connect-proof" },
      headers: owner.headers,
    });

    const token = CreatedToken.parse(await created.json());
    const send = senders(owner, stranger);

    for (const [what, headers, data, status, caller] of refusals(screen, token.value)) {
      const answer = await send[caller](headers, data);
      expect(answer.status(), what).toBe(status);
      expectPrivate(answer);
      expect(attemptCount(screen), `${what} records nothing`).toBe(0);
    }

    const started = await startAs(owner, screen);
    expect(started.status(), "the owner's own page").toBe(201);
    expectPrivate(started);
    expect(attemptCount(screen)).toBe(1);
  } finally {
    await stranger.dispose();
    await owner.api.dispose();
    await screen.close();
  }
});

async function expectUnavailable(screen: Readonly<FreshScreen>, connect: boolean): Promise<void> {
  await screen.page.goto("/settings");
  const view = await aiJson(screen, AiSettingsViewSchema, "GET", AI_SETTINGS_ENDPOINT);
  expect(view.connect, "Connect is on only with a public origin").toBe(connect);

  const response = await screen.context.request.post(START, {
    data: { model: MODEL, revision: view.revision },
    headers: ownPage(screen.fresh.url),
  });

  expect(response.status(), "Start without the prerequisites").toBe(503);
  expect(attemptCount(screen)).toBe(0);
}

test("Without a public origin or a sealing key Connect is unavailable, records nothing, and the typed key still saves", async ({
  browser,
}) => {
  const bare = await aiScreen(browser, newSealingKey());
  const unsealed = await aiScreen(browser);

  try {
    unsealed.fresh.restart({ THREADSIFT_PUBLIC_ORIGIN: unsealed.fresh.url });
    await expectUnavailable(bare, false);
    await expectUnavailable(unsealed, true);

    await aiSection(bare).getByLabel(AI_TEXT.provider, { exact: true }).selectOption("openrouter");
    await expect(
      aiSection(bare).getByText(AI_TEXT.connectUnavailable, { exact: true }),
    ).toBeVisible();
    await expect(
      aiSection(bare).getByRole("button", { name: AI_TEXT.connect, exact: true }),
    ).toHaveCount(0);

    await aiSection(unsealed)
      .getByLabel(AI_TEXT.provider, { exact: true })
      .selectOption("openrouter");

    const blocked = aiSection(unsealed).getByRole("button", { name: AI_TEXT.connect, exact: true });
    await expect(blocked).toHaveAttribute("aria-disabled", "true");
    await aiSection(unsealed).getByLabel(AI_TEXT.model, { exact: true }).fill(MODEL);
    await blocked.click({ force: true });
    expect(attemptCount(unsealed), "a blocked Connect records nothing").toBe(0);

    const saved = await putSettings(bare, AiSaveResponseSchema, {
      provider: "openrouter",
      model: MODEL,
      key: "typed-key-proof",
    });

    expect(saved).toMatchObject({ settings: { provider: "openrouter", keySet: true } });
  } finally {
    await bare.close();
    await unsealed.close();
  }
});
