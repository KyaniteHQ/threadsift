import { expect, test } from "@playwright/test";

import {
  AiSettingsViewSchema,
  AiSaveResponseSchema,
  VerifyResultSchema,
} from "../src/core/ai-contract.ts";
import { redirectListener } from "./ai-redirect.ts";
import {
  AI_SETTINGS_ENDPOINT,
  AI_VERIFY_ENDPOINT,
  aiJson,
  aiScreen,
  countRows,
  newSealingKey,
  saveInBrowser,
} from "./ai.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { isContainerTarget } from "./target.ts";

let screen: FreshScreen;

test.afterEach(async () => {
  await screen?.close();
});

test("Worker refuses private and HTTP AI addresses at save and at Verify", async ({ browser }) => {
  test.skip(isContainerTarget(), "The container permits the owner's private AI endpoint.");
  screen = await aiScreen(browser, newSealingKey());
  await screen.page.goto("/settings");

  const input = {
    provider: "openai-compatible",
    baseUrl: "https://example.com",
    model: "example",
    key: "not-a-real-key",
  };

  expect(
    (await aiJson(screen, AiSettingsViewSchema, "PUT", AI_SETTINGS_ENDPOINT, JSON.stringify(input)))
      .settings?.keySet,
  ).toBe(true);

  for (const baseUrl of [
    "http://example.com",
    "https://127.0.0.1",
    "https://[::1]",
    "https://localhost",
  ]) {
    expect(
      await aiJson(
        screen,
        AiSaveResponseSchema,
        "PUT",
        AI_SETTINGS_ENDPOINT,
        JSON.stringify({ ...input, baseUrl }),
      ),
    ).toEqual({ kind: "refused", reason: "refused", status: null });
    screen.fresh.sql(`UPDATE settings SET base_url = '${baseUrl}'`);
    expect(await aiJson(screen, VerifyResultSchema, "POST", AI_VERIFY_ENDPOINT)).toEqual({
      kind: "refused",
      reason: "refused",
      status: null,
    });
  }

  expect(countRows(screen, "ai_tasks")).toBe(0);
});

test("the container allows a private AI address and refuses its redirect before the key can reach the target", async ({
  browser,
}, info) => {
  test.skip(!isContainerTarget(), "The Worker refuses private AI endpoints before connecting.");
  screen = await aiScreen(browser, newSealingKey());
  const listener = await redirectListener(screen.fresh);

  try {
    await saveInBrowser(screen, "redirect-proof-not-a-provider-key", listener.baseUrl);
    expect(await aiJson(screen, VerifyResultSchema, "POST", AI_VERIFY_ENDPOINT)).toEqual({
      kind: "refused",
      reason: "refused",
      status: null,
    });
    const stats = await listener.stats();
    expect(stats).toMatchObject({
      sourceRequests: 1,
      sourceCredential: true,
      targetRequests: 0,
    });
    await info.attach("redirect-transport", {
      body: JSON.stringify(stats),
      contentType: "application/json",
    });
  } finally {
    await listener.close();
  }
});

test("an unreachable AI host returns a safe category without an upstream status", async ({
  browser,
}) => {
  screen = await aiScreen(browser, newSealingKey());
  await screen.page.goto("/settings");

  const input = {
    provider: "openai-compatible",
    baseUrl: "https://threadsift-ai-proof.invalid",
    model: "example",
    key: "unreachable-proof-key",
  };

  expect(
    (await aiJson(screen, AiSettingsViewSchema, "PUT", AI_SETTINGS_ENDPOINT, JSON.stringify(input)))
      .settings?.keySet,
  ).toBe(true);
  expect(await aiJson(screen, VerifyResultSchema, "POST", AI_VERIFY_ENDPOINT)).toEqual({
    kind: "refused",
    reason: "unreachable",
    status: null,
  });
});
