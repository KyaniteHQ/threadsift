import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

import type { Browser, Page } from "@playwright/test";
import { z } from "zod";

import { newCode, newPassword } from "./access.ts";
import { appShell, envSecret, pickProvider } from "./cli.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";

export const CODEX_CLI = { name: "@openai/codex", version: "0.167.0", binary: "codex" } as const;

export const CODEX_PROVIDER = "codex";

export const CODEX_HOME = "/data/codex";

export const CODEX_AUTH = envSecret("CODEX_AUTH_JSON_B64");

function encodedJson(json: string): string {
  return Buffer.from(json).toString("base64url");
}

export function inventedCodexAuth(): string {
  const issued = Math.floor(Date.now() / 1000);
  const account = "00000000-0000-4000-8000-000000000000";

  const claims = {
    "https://api.openai.com/auth": {
      chatgpt_account_id: account,
      chatgpt_plan_type: "plus",
      chatgpt_user_id: "user-invented",
      user_id: "user-invented",
    },
    iat: issued,
    exp: issued + 3600,
  };

  const jwt = () =>
    `${encodedJson(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${encodedJson(JSON.stringify(claims))}.${randomBytes(32).toString("base64url")}`;

  const file = {
    auth_mode: "chatgpt",
    OPENAI_API_KEY: null,
    tokens: {
      id_token: jwt(),
      access_token: jwt(),
      refresh_token: randomBytes(48).toString("base64url"),
      account_id: account,
    },
    last_refresh: new Date().toISOString(),
  };

  return Buffer.from(JSON.stringify(file)).toString("base64");
}

export function codexScreen(browser: Browser): Promise<FreshScreen> {
  return openSignedIn(browser, newCode(), newPassword());
}

export function writeCodexAuth(screen: FreshScreen, encoded: string): void {
  appShell(screen, `umask 077; printf %s '${encoded}' | base64 -d > ${CODEX_HOME}/auth.json`);
}

export function readCodexAuth(screen: FreshScreen): string {
  return appShell(screen, `base64 -w0 < ${CODEX_HOME}/auth.json`).trim();
}

export function saveRefreshedAuth(screen: FreshScreen): void {
  const out = process.env["THREADSIFT_CODEX_REFRESHED_OUT"] ?? "";

  if (out !== "") writeFileSync(out, readCodexAuth(screen), { mode: 0o600 });
}

export function pickCodex(page: Page): Promise<void> {
  return pickProvider(page, CODEX_PROVIDER);
}

const AuthFileSchema = z.object({
  tokens: z.object({ access_token: z.string(), refresh_token: z.string(), id_token: z.string() }),
});

export function tokensOf(encoded: string): string[] {
  const { tokens } = AuthFileSchema.parse(
    JSON.parse(Buffer.from(encoded, "base64").toString("utf8")),
  );

  return [encoded, tokens.access_token, tokens.refresh_token, tokens.id_token];
}

const RESERVED_HOME = `cd ${CODEX_HOME} && [ -f skills ] && [ ! -s skills ] && [ -d AGENTS.md ] && [ -z "$(ls -A AGENTS.md)" ] && [ -d AGENTS.override.md ] && [ -z "$(ls -A AGENTS.override.md)" ] && echo reserved`;

export function homeIsReserved(screen: FreshScreen): boolean {
  return appShell(screen, `${RESERVED_HOME}; true`).trim() === "reserved";
}
