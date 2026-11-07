import { type TestInfo, expect, test } from "@playwright/test";
import { z } from "zod";

import { AiSaveResponseSchema, VerifyResultSchema } from "../src/core/ai-contract.ts";
import { AI_TEXT } from "../web/src/ai-text.ts";
import {
  AI_SETTINGS_ENDPOINT,
  AI_VERIFY_ENDPOINT,
  aiJson,
  assertNoSecret,
  countRows,
  putSettings,
} from "./ai.ts";
import { postLinkRaw, settled } from "./api.ts";
import { ESSAY } from "./articles.ts";
import {
  CLAUDE_PROVIDER,
  claudeScreen,
  claudeToken,
  installClaude,
  invalidClaudeToken,
  pickClaude,
  settingsView,
  taskRows,
} from "./claude-code.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { isContainerTarget } from "./target.ts";

test.use({ trace: "off", video: "off", screenshot: "off" });

test.describe.configure({ mode: "serial", timeout: 420_000 });

let screen: FreshScreen;

test.afterEach(async () => {
  await screen?.close();
});

async function saveAndVerify(): Promise<void> {
  const { page } = screen;
  await pickClaude(page);
  await page.getByRole("button", { name: AI_TEXT.save, exact: true }).click();
  await expect(page.getByText(AI_TEXT.saved, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: AI_TEXT.verify, exact: true }).click();
}

test("without the CLI the Claude Code row is absent and the API refuses it", async ({
  browser,
}) => {
  screen = await claudeScreen(browser);
  const view = await settingsView(screen);

  expect(view.providers).not.toContain(CLAUDE_PROVIDER);
  expect(view.signedIn).toEqual([]);
  await screen.page.goto("/settings");
  await expect(screen.page.getByLabel(AI_TEXT.provider, { exact: true })).toBeVisible();
  await expect(screen.page.getByRole("option", { name: AI_TEXT.claudeCode })).toHaveCount(0);

  const refused = await screen.context.request.put(AI_SETTINGS_ENDPOINT, {
    data: { provider: CLAUDE_PROVIDER, model: "" },
  });

  expect(refused.status()).toBe(400);
  expect(countRows(screen, "settings")).toBe(0);
  expect(countRows(screen, "ai_tasks")).toBe(0);
});

test("an installed Claude Code with no login shows the sign-in command and keeps Save and Verify off", async ({
  browser,
}) => {
  test.skip(!isContainerTarget(), "Claude Code runs only on the container");
  screen = await claudeScreen(browser);
  installClaude(screen);

  const view = await settingsView(screen);

  expect(view.providers).toContain(CLAUDE_PROVIDER);
  expect(view.signedIn).toEqual([]);
  await pickClaude(screen.page);
  await expect(screen.page.getByText(AI_TEXT.claudeCodeSignedOut)).toBeVisible();
  await expect(
    screen.page.getByText(AI_TEXT.claudeCodeSignInCommand, { exact: true }),
  ).toBeVisible();
  await expect(screen.page.getByRole("button", { name: AI_TEXT.save, exact: true })).toBeDisabled();
  await expect(
    screen.page.getByRole("button", { name: AI_TEXT.verify, exact: true }),
  ).toBeDisabled();

  expect(
    await putSettings(screen, AiSaveResponseSchema, { provider: CLAUDE_PROVIDER, model: "" }),
  ).toEqual({ kind: "refused", reason: "not-configured", status: null });
  expect(await aiJson(screen, VerifyResultSchema, "POST", AI_VERIFY_ENDPOINT)).toEqual({
    kind: "refused",
    reason: "not-configured",
    status: null,
  });
  expect(countRows(screen, "settings")).toBe(0);
});

test("a rejected token shows wrong-key on Verify and leaks nothing", async ({ browser }, info) => {
  test.skip(!isContainerTarget(), "Claude Code runs only on the container");
  const rejected = invalidClaudeToken();
  screen = await claudeScreen(browser, rejected);
  installClaude(screen);
  await saveAndVerify();
  await expect(screen.page.getByText(AI_TEXT.claudeCodeRejected, { exact: true })).toBeVisible({
    timeout: 120_000,
  });

  const rows = taskRows(screen);

  expect(rows).toMatchObject([
    { kind: "digest", executor: "cli", provider: CLAUDE_PROVIDER, model: null, state: "failed" },
  ]);
  expect(rows[0]?.refusal).toBe("wrong-key");
  expect(rows[0]?.status).toBe(401);
  const log = screen.fresh.logs();

  assertNoSecret(log, [rejected]);
  assertNoSecret(JSON.stringify(rows), [rejected]);
  await info.attach("rejected-token-task-rows", {
    body: JSON.stringify(rows),
    contentType: "application/json",
  });
});

async function proveStoredDigest(info: TestInfo, token: string): Promise<void> {
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

  expect(stored).toEqual([
    { provider: CLAUDE_PROVIDER, model: null, executor: "cli", state: "done" },
  ]);
  await info.attach("automatic-digest", {
    body: JSON.stringify(item),
    contentType: "application/json",
  });
  assertNoSecret(JSON.stringify(item), [token]);
}

test("Claude Code in the volume verifies, digests a pasted article and survives a recreated container", async ({
  browser,
}, info) => {
  const token = claudeToken();

  test.skip(
    !isContainerTarget() ||
      (token === undefined && process.env["THREADSIFT_CLAUDE_REQUIRED"] !== "true"),
    "Claude Code needs the container and CLAUDE_CODE_OAUTH_TOKEN; pull requests skip this case.",
  );
  expect(token, "the authenticated proof requires CLAUDE_CODE_OAUTH_TOKEN").toBeDefined();

  if (token === undefined) return;
  screen = await claudeScreen(browser, token);
  installClaude(screen);
  await saveAndVerify();
  await expect(screen.page.getByText(AI_TEXT.verified, { exact: true })).toBeVisible({
    timeout: 120_000,
  });
  await expect(screen.page.locator(".ai-digest h3")).not.toBeEmpty();
  await proveStoredDigest(info, token);

  screen.fresh.restart({ CLAUDE_CODE_OAUTH_TOKEN: token });
  const view = await settingsView(screen);

  expect(view.settings).toEqual({ provider: CLAUDE_PROVIDER, model: "" });
  expect(view.signedIn).toEqual([CLAUDE_PROVIDER]);
  expect(countRows(screen, "digests")).toBe(1);

  const again = await aiJson(screen, VerifyResultSchema, "POST", AI_VERIFY_ENDPOINT);

  expect(again.kind).toBe("done");
  const log = screen.fresh.logs();

  assertNoSecret(log, [token]);
  assertNoSecret(JSON.stringify(taskRows(screen)), [token]);
  await info.attach("server-log", { body: log, contentType: "text/plain" });
});
