import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

import { type Browser, type Page, expect } from "@playwright/test";
import { z } from "zod";

import { AiSettingsViewSchema } from "../src/core/ai-contract.ts";
import { AI_TEXT } from "../web/src/ai-text.ts";
import { AI_SETTINGS_ENDPOINT, screenWithEnv } from "./ai.ts";
import type { FreshScreen } from "./fresh-screen.ts";

export const CLAUDE_CODE_VERSION = "2.1.319";

export const CLAUDE_PROVIDER = "claude-code";

export function claudeToken(): string | undefined {
  const token = process.env["CLAUDE_CODE_OAUTH_TOKEN"] ?? "";

  return token === "" ? undefined : token;
}

export function invalidClaudeToken(): string {
  return `sk-ant-oat01-${randomBytes(32).toString("hex")}`;
}

export function claudeScreen(browser: Browser, token?: string): Promise<FreshScreen> {
  return screenWithEnv(browser, "CLAUDE_CODE_OAUTH_TOKEN", token);
}

export function lines(output: string): string[] {
  return output.split("\n").filter((line) => line !== "");
}

export function appShell(screen: FreshScreen, script: string): string {
  const [command = "", ...args] = screen.fresh.appExec.split(" ").filter((word) => word !== "");

  return execFileSync(command, [...args, "sh", "-s"], {
    encoding: "utf8",
    input: script,
    stdio: ["pipe", "pipe", "inherit"],
  });
}

export function installClaude(screen: FreshScreen): void {
  const reported = appShell(
    screen,
    `npm install --global @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} > /tmp/npm-install.log 2>&1 || { tail -n 8 /tmp/npm-install.log >&2; exit 1; }; claude --version`,
  );

  expect(reported).toContain(CLAUDE_CODE_VERSION);
  screen.fresh.restart();
}

export async function settingsView(screen: FreshScreen) {
  const response = await screen.context.request.get(AI_SETTINGS_ENDPOINT);

  return AiSettingsViewSchema.parse(await response.json());
}

export async function pickClaude(page: Page): Promise<void> {
  await page.goto("/settings");
  await page.getByLabel(AI_TEXT.provider, { exact: true }).selectOption(CLAUDE_PROVIDER);
}

const LIST_RUNS = `for p in /proc/[0-9]*; do c=$(tr '\\0' ' ' < $p/cmdline 2>/dev/null) || continue; case "$c" in *--json-sche[m]a*) set -- $(sed 's/^.*) //' $p/stat); echo "$(basename $p) $3";; esac; done`;

export function claudeRuns(screen: FreshScreen) {
  return lines(appShell(screen, LIST_RUNS)).map((line) => {
    const [pid = "", pgid = ""] = line.split(" ");

    return { pid: Number(pid), pgid: Number(pgid) };
  });
}

export function groupMembers(screen: FreshScreen, pgid: number): number[] {
  const script = `for p in /proc/[0-9]*; do set -- $(sed 's/^.*) //' $p/stat 2>/dev/null); [ "$3" = "${pgid}" ] && basename $p; done; true`;

  return lines(appShell(screen, script)).map(Number);
}

export function taskFolders(screen: FreshScreen): string[] {
  return lines(appShell(screen, "ls -d /tmp/threadsift-cli-* 2>/dev/null; true"));
}

export const AiTaskRows = z.array(
  z.object({
    kind: z.string(),
    executor: z.string(),
    provider: z.string().nullable(),
    model: z.string().nullable(),
    state: z.string(),
    refusal: z.string().nullable(),
    status: z.number().nullable(),
    inputs: z.string(),
    result: z.string().nullable(),
  }),
);

const TASK_ROWS_SQL =
  "SELECT kind, executor, provider, model, state, refusal, status, inputs, result FROM ai_tasks ORDER BY id";

export const taskRows = (screen: FreshScreen) => screen.fresh.query(TASK_ROWS_SQL, AiTaskRows);
