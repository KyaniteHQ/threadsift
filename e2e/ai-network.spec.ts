import { expect, test } from "@playwright/test";
import { z } from "zod";

import { AiSettingsViewSchema, VerifyResultSchema } from "../src/core/ai-contract.ts";
import { redirectListener } from "./ai-redirect.ts";
import { aiCall, aiScreen, newSealingKey, saveInBrowser } from "./ai.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { isContainerTarget } from "./target.ts";

let screen: FreshScreen;
const endpoint = "/api/settings/ai";
const verifyEndpoint = `${endpoint}/verify`;

test.afterEach(async () => {
  await screen?.close();
});

function countRows(table: string): number {
  return (
    screen.fresh.query(
      `SELECT count(*) AS count FROM ${table}`,
      z.array(z.object({ count: z.number() })),
    )[0]?.count ?? -1
  );
}

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
    AiSettingsViewSchema.parse(
      JSON.parse(await aiCall(screen, "PUT", endpoint, JSON.stringify(input))),
    ).settings?.keySet,
  ).toBe(true);

  for (const baseUrl of [
    "http://example.com",
    "https://127.0.0.1",
    "https://[::1]",
    "https://localhost",
  ]) {
    expect(
      VerifyResultSchema.parse(
        JSON.parse(await aiCall(screen, "PUT", endpoint, JSON.stringify({ ...input, baseUrl }))),
      ),
    ).toEqual({ kind: "refused", reason: "refused", status: null });
    screen.fresh.sql(`UPDATE settings SET base_url = '${baseUrl}'`);
    expect(
      VerifyResultSchema.parse(JSON.parse(await aiCall(screen, "POST", verifyEndpoint))),
    ).toEqual({
      kind: "refused",
      reason: "refused",
      status: null,
    });
  }

  expect(countRows("ai_tasks")).toBe(0);
});

test("the container allows a private AI address and refuses its redirect before the key can reach the target", async ({
  browser,
}, info) => {
  test.skip(!isContainerTarget(), "The Worker refuses private AI endpoints before connecting.");
  screen = await aiScreen(browser, newSealingKey());
  const listener = await redirectListener(screen.fresh);

  try {
    await saveInBrowser(screen, "redirect-proof-not-a-provider-key", listener.baseUrl);
    const raw = await aiCall(screen, "POST", verifyEndpoint);
    expect(VerifyResultSchema.parse(JSON.parse(raw))).toEqual({
      kind: "refused",
      reason: "refused",
      status: null,
    });
    const stats = await listener.stats();
    expect(stats).toEqual({
      sourceRequests: 1,
      sourceCredential: true,
      targetRequests: 0,
      targetCredential: false,
    });
    await info.attach("redirect-transport", {
      body: JSON.stringify(stats),
      contentType: "application/json",
    });
  } finally {
    await listener.close();
  }
});
