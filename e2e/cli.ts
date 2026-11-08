import { execFileSync } from "node:child_process";

import { type Page, type TestInfo, expect } from "@playwright/test";
import { z } from "zod";

import {
  AiSettingsViewSchema,
  type Provider,
  VerifyResultSchema,
} from "../src/core/ai-contract.ts";
import { AI_TEXT } from "../web/src/ai-text.ts";
import { AI_SETTINGS_ENDPOINT, AI_VERIFY_ENDPOINT, assertNoSecret } from "./ai.ts";
import { postLinkRaw, settled } from "./api.ts";
import { ESSAY } from "./articles.ts";
import type { FreshScreen } from "./fresh-screen.ts";

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

export async function settingsView(screen: FreshScreen) {
  const response = await screen.context.request.get(AI_SETTINGS_ENDPOINT);

  return AiSettingsViewSchema.parse(await response.json());
}

export async function pickProvider(page: Page, provider: Provider): Promise<void> {
  await page.goto("/settings");
  await page.getByLabel(AI_TEXT.provider, { exact: true }).selectOption(provider);
}

const LIST_RUNS = `for p in /proc/[0-9]*; do c=$(tr '\\0' ' ' < $p/cmdline 2>/dev/null) || continue; case "$c" in *--json-sche[m]a*) cli=claude;; *--output-sche[m]a*) cli=codex;; *) continue;; esac; set -- $(sed 's/^.*) //' $p/stat); [ "$(basename $p)" = "$3" ] && echo "$3 $cli"; done`;

export function cliRuns(screen: FreshScreen) {
  return lines(appShell(screen, LIST_RUNS)).map((line) => {
    const [pgid = "", cli = ""] = line.split(" ");

    return { pgid: Number(pgid), cli };
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

export async function saveAndVerify(screen: FreshScreen, provider: Provider): Promise<void> {
  const { page } = screen;

  await pickProvider(page, provider);
  await page.getByRole("button", { name: AI_TEXT.save, exact: true }).click();
  await expect(page.getByText(AI_TEXT.saved, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: AI_TEXT.verify, exact: true }).click();
}

export async function proveStoredDigest(
  screen: FreshScreen,
  info: TestInfo,
  provider: Provider,
  secrets: readonly string[],
): Promise<void> {
  const request = screen.context.request;
  const saved = await postLinkRaw(request, ESSAY);
  const item = await settled(request, saved.body.item.id, 420_000);

  expect(item).toMatchObject({ status: "ready", digestOutcome: "none" });

  const stored = screen.fresh.query(
    "SELECT d.provider, d.model, t.executor, t.state FROM digests d JOIN ai_tasks t ON t.id = d.task_id",
    z.array(
      z.object({
        provider: z.string(),
        model: z.string().nullable(),
        executor: z.string(),
        state: z.string(),
      }),
    ),
  );

  expect(stored).toEqual([{ provider, model: null, executor: "cli", state: "done" }]);
  await info.attach("automatic-digest", {
    body: JSON.stringify(item),
    contentType: "application/json",
  });
  assertNoSecret(JSON.stringify(item), secrets);
}

export async function verifyCall(target: FreshScreen, signal?: AbortSignal) {
  const cookies = await target.context.cookies();
  const cookie = cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
  const init: RequestInit = { method: "POST", headers: { cookie, origin: target.fresh.url } };

  if (signal !== undefined) init.signal = signal;

  const response = await fetch(`${target.fresh.url}${AI_VERIFY_ENDPOINT}`, init);

  return VerifyResultSchema.parse(await response.json());
}

export function envSecret(name: string): string | undefined {
  const value = process.env[name] ?? "";

  return value === "" ? undefined : value;
}

interface CliPackage {
  readonly name: string;
  readonly version: string;
  readonly binary: string;
}

export function installCli(screen: FreshScreen, { name, version, binary }: Readonly<CliPackage>) {
  const reported = appShell(
    screen,
    `npm install --global ${name}@${version} > /tmp/npm-install.log 2>&1 || { tail -n 8 /tmp/npm-install.log >&2; exit 1; }; ${binary} --version`,
  );

  expect(reported).toContain(version);
  screen.fresh.restart();
}
