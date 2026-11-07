import { type TestInfo, expect, test } from "@playwright/test";
import { z } from "zod";

import {
  AiSettingsViewSchema,
  AiSaveResponseSchema,
  VerifyResultSchema,
} from "../src/core/ai-contract.ts";
import { AI_TEXT } from "../web/src/ai-text.ts";
import {
  hasAiCredentials,
  wrongAiKey,
  AI_SETTINGS_ENDPOINT,
  AI_VERIFY_ENDPOINT,
  aiJson,
  aiScreen,
  assertNoSecret,
  countRows,
  sealedKey,
  newSealingKey,
  proofProvider,
  saveInBrowser,
  openSealed,
  expectDigest,
  pressKeepingFocus,
  putSettings,
  readDigestTask,
} from "./ai.ts";
import { type FreshScreen } from "./fresh-screen.ts";

test.use({ trace: "off", video: "off", screenshot: "off" });

test.describe.configure({ mode: "serial", timeout: 180_000 });

let screen: FreshScreen;

test.afterEach(async () => {
  await screen?.close();
});

test("AI settings refuse a missing or malformed sealing key without a write", async ({
  browser,
}) => {
  for (const secret of [undefined, "malformed"] as const) {
    screen = await aiScreen(browser, secret);
    await screen.page.goto("/settings");
    await expect(screen.page.getByText(AI_TEXT["secret-missing"], { exact: true })).toBeVisible();
    await expect(
      screen.page.getByRole("button", { name: AI_TEXT.save, exact: true }),
    ).toBeDisabled();

    const result = await aiJson(
      screen,
      AiSaveResponseSchema,
      "PUT",
      AI_SETTINGS_ENDPOINT,
      JSON.stringify({
        provider: "openai-compatible",
        baseUrl: "https://example.com",
        model: "example",
        key: "not-a-real-key",
      }),
    );

    expect(result).toEqual({ kind: "refused", reason: "secret-missing", status: null });
    expect(countRows(screen, "settings")).toBe(0);
    await screen.close();
  }

  screen = await aiScreen(browser, newSealingKey());
  await saveInBrowser(screen, "changed-key-proof", "https://example.com", "example");
  screen.fresh.restart({ THREADSIFT_SECRET_KEY: newSealingKey() });
  await screen.page.reload();
  await expect(screen.page.getByText(AI_TEXT["secret-missing"], { exact: true })).toBeVisible();
  expect(await aiJson(screen, VerifyResultSchema, "POST", AI_VERIFY_ENDPOINT)).toEqual({
    kind: "refused",
    reason: "secret-missing",
    status: null,
  });
  expect(countRows(screen, "ai_tasks")).toBe(0);
});

type ProofProvider = Readonly<ReturnType<typeof proofProvider>>;

async function retainAndRestart(provider: ProofProvider, secret: string): Promise<void> {
  const first = sealedKey(screen);
  expect(
    openSealed(first, secret) === provider.key,
    "configured sealing key opens the saved API key",
  ).toBe(true);
  expect(() => openSealed(first, newSealingKey())).toThrow();
  expect(first.includes(provider.key), "database contains no plaintext key").toBe(false);

  const resealed = await aiJson(
    screen,
    AiSettingsViewSchema,
    "PUT",
    AI_SETTINGS_ENDPOINT,
    JSON.stringify({
      provider: "openai-compatible",
      baseUrl: provider.baseUrl,
      model: provider.model,
      key: provider.key,
    }),
  );

  expect(resealed.settings).toMatchObject({ keySet: true });
  expect(first === sealedKey(screen), "two explicit key saves use different IVs").toBe(false);
  expect(
    openSealed(sealedKey(screen), secret) === provider.key,
    "the second explicit save decrypts to the same API key",
  ).toBe(true);
  screen.fresh.restart();
  await screen.page.reload();
  const read = await aiJson(screen, AiSettingsViewSchema, "GET", AI_SETTINGS_ENDPOINT);
  expect(read.settings).toMatchObject({ keySet: true });
  expect(read.secretReady).toBe(true);
}

async function verifyDigest(info: TestInfo): Promise<void> {
  await pressKeepingFocus(
    screen.page.getByRole("button", { name: AI_TEXT.verify, exact: true }),
    AI_VERIFY_ENDPOINT,
  );
  await expect(screen.page.getByText(AI_TEXT.verified, { exact: true })).toBeVisible({
    timeout: 120_000,
  });
  expect(countRows(screen, "items")).toBe(0);

  const digest = readDigestTask(screen);
  expectDigest(digest);
  await info.attach("digest", { body: JSON.stringify(digest), contentType: "application/json" });
}

async function refuseWrongKey(
  wrong: string,
  provider: ProofProvider,
  info: TestInfo,
): Promise<void> {
  await saveInBrowser(screen, wrong, provider.baseUrl);

  const responsePromise = screen.page.waitForResponse((response) =>
    response.url().endsWith(AI_VERIFY_ENDPOINT),
  );

  await pressKeepingFocus(
    screen.page.getByRole("button", { name: AI_TEXT.verify, exact: true }),
    AI_VERIFY_ENDPOINT,
  );
  const raw = await (await responsePromise).text();
  expect(VerifyResultSchema.parse(JSON.parse(raw))).toEqual({
    kind: "refused",
    reason: "wrong-key",
    status: 401,
  });
  await expect(screen.page.getByText(AI_TEXT["wrong-key"], { exact: true })).toBeVisible();
  const log = screen.fresh.logs();
  assertNoSecret(raw, [wrong, provider.key]);
  assertNoSecret(log, [wrong, provider.key]);
  await info.attach("verify-refusal", { body: raw, contentType: "application/json" });
  await info.attach("server-log", { body: log, contentType: "text/plain" });
  await info.attach("server-log-capture", {
    body: JSON.stringify({
      source:
        process.env["THREADSIFT_TARGET"] === "container"
          ? "podman logs across the complete Instance run"
          : "wrangler log across the complete Instance run",
      bytes: Buffer.byteLength(log),
    }),
    contentType: "application/json",
  });
  await capturedPrivacy(wrong, provider.key, info);
}

async function capturedPrivacy(wrong: string, key: string, info: TestInfo): Promise<void> {
  const tasks = screen.fresh.query(
    "SELECT kind, inputs, input_revision, executor, attempts, deadline, state, result, refusal, status FROM ai_tasks",
    z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))),
  );

  assertNoSecret(JSON.stringify(tasks), [wrong, key]);
  await info.attach("ai-task-rows", {
    body: JSON.stringify(tasks),
    contentType: "application/json",
  });
}

test("saved keys are sealed, survive restart, and Verify returns a real Digest or a clean wrong-key refusal", async ({
  browser,
}, info) => {
  test.skip(
    !hasAiCredentials() && process.env["THREADSIFT_AI_REQUIRED"] !== "true",
    "Workers AI credentials are unavailable; fork pull requests skip the real AI proof.",
  );
  expect(hasAiCredentials(), "same-repository AI proof requires Workers AI credentials").toBe(true);
  const secret = newSealingKey();
  screen = await aiScreen(browser, secret);
  const provider = proofProvider();
  const wrong = wrongAiKey();
  await saveInBrowser(screen, provider.key, provider.baseUrl);
  await retainAndRestart(provider, secret);
  await verifyDigest(info);
  screen.fresh.sql(
    "CREATE TRIGGER refuse_ai_done BEFORE UPDATE ON ai_tasks WHEN NEW.state = 'done' BEGIN SELECT RAISE(FAIL, 'result write refused'); END",
  );
  const failedWrite = await aiJson(screen, VerifyResultSchema, "POST", AI_VERIFY_ENDPOINT);
  expect(failedWrite).toEqual({ kind: "refused", reason: "unreachable", status: null });

  const failedRows = screen.fresh.query(
    "SELECT state, refusal FROM ai_tasks ORDER BY id DESC LIMIT 1",
    z.array(z.object({ state: z.string(), refusal: z.string().nullable() })),
  );

  expect(failedRows).toEqual([{ state: "failed", refusal: "unreachable" }]);
  screen.fresh.sql("DROP TRIGGER refuse_ai_done");
  await refuseWrongKey(wrong, provider, info);
  await saveInBrowser(
    screen,
    provider.key,
    provider.baseUrl,
    "@cf/threadsift/nonexistent-proof-model",
  );
  const wrongModel = await aiJson(screen, VerifyResultSchema, "POST", AI_VERIFY_ENDPOINT);
  expect(wrongModel).toEqual({ kind: "refused", reason: "no-json", status: 400 });
  await info.attach("wrong-model", {
    body: JSON.stringify(wrongModel),
    contentType: "application/json",
  });
});

test("the OpenRouter row saves without a caller-supplied base URL", async ({ browser }) => {
  screen = await aiScreen(browser, newSealingKey());
  await screen.page.goto("/settings");

  const saved = await aiJson(
    screen,
    AiSettingsViewSchema,
    "PUT",
    AI_SETTINGS_ENDPOINT,
    JSON.stringify({ provider: "openrouter", model: "shape-proof", key: "openrouter-shape-proof" }),
  );

  expect(saved.settings).toEqual({
    provider: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "shape-proof",
    keySet: true,
  });
  await screen.page.reload();
  await expect(screen.page.getByLabel(AI_TEXT.provider, { exact: true })).toHaveValue("openrouter");
  await expect(screen.page.getByLabel(AI_TEXT.baseUrl, { exact: true })).toHaveCount(0);
  await screen.page.getByLabel(AI_TEXT.provider, { exact: true }).selectOption("openai-compatible");
  await expect(screen.page.getByLabel(AI_TEXT.baseUrl, { exact: true })).toHaveValue("");
});

test("a save needs a key on first use and after changing the connection, and keeps the saved key when the connection is unchanged", async ({
  browser,
}) => {
  const secret = newSealingKey();
  screen = await aiScreen(browser, secret);
  await screen.page.goto("/settings");
  await expect(screen.page.getByLabel(AI_TEXT.key, { exact: true })).toHaveAttribute(
    "required",
    "",
  );
  const input = { provider: "openai-compatible", baseUrl: "https://example.com", model: "example" };
  const refusal = { kind: "refused", reason: "key-needed", status: null };
  expect(await putSettings(screen, AiSaveResponseSchema, input)).toEqual(refusal);
  expect(countRows(screen, "settings")).toBe(0);
  await saveInBrowser(screen, "key-needed-proof", input.baseUrl, input.model);

  const kept = await putSettings(screen, AiSettingsViewSchema, input);

  expect(kept.settings).toMatchObject({ keySet: true });
  expect(
    openSealed(sealedKey(screen), secret) === "key-needed-proof",
    "an unchanged connection saved without a key still opens to the original key",
  ).toBe(true);

  for (const changed of [
    { ...input, baseUrl: "https://example.org" },
    { ...input, model: "another" },
    { provider: "openrouter", model: "example" },
  ]) {
    expect(await putSettings(screen, AiSaveResponseSchema, changed)).toEqual(refusal);
  }
});
