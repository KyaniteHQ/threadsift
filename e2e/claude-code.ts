import { randomBytes } from "node:crypto";

import type { Browser, Page } from "@playwright/test";

import { screenWithEnv } from "./ai.ts";
import { envSecret, pickProvider } from "./cli.ts";
import type { FreshScreen } from "./fresh-screen.ts";

export const CLAUDE_CLI = {
  name: "@anthropic-ai/claude-code",
  version: "2.1.319",
  binary: "claude",
} as const;

export const CLAUDE_PROVIDER = "claude-code";

export function claudeToken(): string | undefined {
  return envSecret("CLAUDE_CODE_OAUTH_TOKEN");
}

export function invalidClaudeToken(): string {
  return `sk-ant-oat01-${randomBytes(32).toString("hex")}`;
}

export function claudeScreen(browser: Browser, token?: string): Promise<FreshScreen> {
  return screenWithEnv(browser, "CLAUDE_CODE_OAUTH_TOKEN", token);
}

export function pickClaude(page: Page): Promise<void> {
  return pickProvider(page, CLAUDE_PROVIDER);
}
