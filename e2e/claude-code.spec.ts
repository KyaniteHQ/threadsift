import { expect, test } from "@playwright/test";

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
import {
  CLAUDE_PROVIDER,
  claudeScreen,
  claudeToken,
  CLAUDE_CLI,
  invalidClaudeToken,
  pickClaude,
} from "./claude-code.ts";
import { installCli, proveStoredDigest, saveAndVerify, settingsView, taskRows } from "./cli.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { isContainerTarget } from "./target.ts";

test.use({ trace: "off", video: "off", screenshot: "off" });

test.describe.configure({ mode: "serial", timeout: 420_000 });

let screen: FreshScreen;

test.afterEach(async () => {
  await screen?.close();
});

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
  installCli(screen, CLAUDE_CLI);

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
  installCli(screen, CLAUDE_CLI);
  await saveAndVerify(screen, CLAUDE_PROVIDER);
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
  installCli(screen, CLAUDE_CLI);
  await saveAndVerify(screen, CLAUDE_PROVIDER);
  await expect(screen.page.getByText(AI_TEXT.verified, { exact: true })).toBeVisible({
    timeout: 120_000,
  });
  await expect(screen.page.locator(".ai-digest h3")).not.toBeEmpty();
  await proveStoredDigest(screen, info, CLAUDE_PROVIDER, [token]);

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
