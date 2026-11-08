import { type APIResponse, type Browser, expect } from "@playwright/test";
import { z } from "zod";

import { sha256Hex } from "./access-helpers.ts";
import { newCode, newPassword } from "./access.ts";
import { openSealed, newSealingKey } from "./ai.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { type Signed, signInWith } from "./password.ts";

export const START = "/api/settings/ai/openrouter/start";
export const CALLBACK = "/api/settings/ai/openrouter/callback";
export const CONNECT_LIFETIME_MS = 600_000;
export const MODEL = "nvidia/nemotron-3.5-super-vl:free";
export const FAKE_CODE = "not-a-real-authorization-code";

const Attempts = z.array(
  z.object({
    state_digest: z.string(),
    session_digest: z.string(),
    sealed_verifier: z.string(),
    model: z.string(),
    expected_revision: z.number(),
    public_origin: z.string(),
    created_at: z.number(),
    expires_at: z.number(),
  }),
);

const Count = z.array(z.object({ n: z.number() }));

export interface ConnectScreen extends FreshScreen {
  readonly sealingKey: string;
  readonly password: string;
  readonly origin: string;
}

export async function connectScreen(browser: Browser): Promise<ConnectScreen> {
  const sealingKey = newSealingKey();
  const password = newPassword();
  const previous = process.env["THREADSIFT_SECRET_KEY"];
  process.env["THREADSIFT_SECRET_KEY"] = sealingKey;

  try {
    const screen = await openSignedIn(browser, newCode(), password);
    const origin = screen.fresh.url;

    screen.fresh.restart({ THREADSIFT_SECRET_KEY: sealingKey, THREADSIFT_PUBLIC_ORIGIN: origin });

    return { ...screen, sealingKey, password, origin };
  } finally {
    if (previous === undefined) delete process.env["THREADSIFT_SECRET_KEY"];
    else process.env["THREADSIFT_SECRET_KEY"] = previous;
  }
}

export function ownPage(origin: string) {
  return { origin, "sec-fetch-site": "same-origin" } as const;
}

export interface StartBody {
  readonly model: string;
  readonly revision: number;
}

export const FIRST_START: StartBody = { model: MODEL, revision: 0 };

export function startAs(
  session: Readonly<Signed>,
  screen: Readonly<ConnectScreen>,
  body: Readonly<StartBody> = FIRST_START,
): Promise<APIResponse> {
  return session.api.post(START, {
    data: body,
    headers: { ...session.headers, ...ownPage(screen.origin) },
  });
}

export function signedIn(screen: Readonly<ConnectScreen>): Promise<Signed> {
  return signInWith(screen.origin, screen.password);
}

export const StartAnswer = z.object({ authorizationUrl: z.url(), expiresAt: z.number() });

export async function started(response: APIResponse) {
  expect(response.status(), "Connect start").toBe(201);
  const { authorizationUrl, expiresAt } = StartAnswer.parse(await response.json());
  const url = new URL(authorizationUrl);

  return { url, expiresAt, state: url.searchParams.get("state") ?? "" };
}

export function attempts(screen: Readonly<FreshScreen>) {
  return screen.fresh.query(
    "SELECT state_digest, session_digest, sealed_verifier, model, expected_revision, public_origin, created_at, expires_at FROM openrouter_connect_transactions ORDER BY created_at",
    Attempts,
  );
}

function scalar(screen: Readonly<FreshScreen>, query: string): number {
  return screen.fresh.query(query, Count)[0]?.n ?? -1;
}

export function attemptCount(screen: Readonly<FreshScreen>): number {
  return scalar(screen, "SELECT count(*) AS n FROM openrouter_connect_transactions");
}

export function revisionOf(screen: Readonly<FreshScreen>): number {
  return scalar(screen, "SELECT revision AS n FROM ai_settings_revision");
}

export function settingsRows(screen: Readonly<FreshScreen>): number {
  return scalar(screen, "SELECT count(*) AS n FROM settings");
}

export function jobRows(screen: Readonly<FreshScreen>): number {
  return scalar(screen, "SELECT count(*) AS n FROM jobs");
}

export function verifierOf(screen: Readonly<ConnectScreen>, state: string): string {
  const row = attempts(screen).find((attempt) => attempt.state_digest === sha256Hex(state));

  return openSealed(row?.sealed_verifier ?? "", screen.sealingKey);
}

export function callbackFor(state: string, code = FAKE_CODE): string {
  return `${CALLBACK}?${new URLSearchParams({ code, state }).toString()}`;
}

export function callback(
  session: Readonly<Pick<Signed, "api"> & Partial<Pick<Signed, "headers">>>,
  address: string,
): Promise<APIResponse> {
  return session.api.get(address, {
    headers: { "sec-fetch-mode": "navigate", ...session.headers },
    maxRedirects: 0,
  });
}

export function expectPrivate(response: APIResponse): void {
  expect(response.headers()["cache-control"], "callback cache-control").toBe("no-store");
  expect(response.headers()["referrer-policy"], "callback referrer-policy").toBe("no-referrer");
}

export function expectNotice(response: APIResponse, notice: string): void {
  expect(response.status(), "callback status").toBe(303);
  expect(response.headers()["location"], "callback location").toBe(
    `/settings?openrouter=${notice}`,
  );
  expectPrivate(response);
}
