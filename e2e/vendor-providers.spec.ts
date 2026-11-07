import { type Browser, type TestInfo, expect, test } from "@playwright/test";
import { z } from "zod";

import {
  AiSaveResponseSchema,
  AiSettingsViewSchema,
  VerifyResultSchema,
} from "../src/core/ai-contract.ts";
import { AI_TEXT } from "../web/src/ai-text.ts";
import {
  AI_SETTINGS_ENDPOINT,
  AI_VERIFY_ENDPOINT,
  aiScreen,
  assertNoSecret,
  countRows,
  fillKey,
  newSealingKey,
  openSealed,
  pressKeepingFocus,
  putSettings,
  saveAndExpectKeyCleared,
  sealedKey,
} from "./ai.ts";
import { type FreshScreen } from "./fresh-screen.ts";

test.use({ trace: "off", video: "off", screenshot: "off" });

test.describe.configure({ mode: "serial", timeout: 180_000 });

const VENDORS = [
  {
    id: "anthropic",
    label: AI_TEXT.anthropic,
    url: "https://api.anthropic.com/v1",
    model: "claude-haiku-5-5",
    wrongKeyStatus: 401,
  },
  {
    id: "openai",
    label: AI_TEXT.openai,
    url: "https://api.openai.com/v1",
    model: "gpt-5",
    wrongKeyStatus: 401,
  },
  {
    id: "xai",
    label: AI_TEXT.xai,
    url: "https://api.x.ai/v1",
    model: "grok-4",
    wrongKeyStatus: 400,
  },
] as const;

type Vendor = (typeof VENDORS)[number];

const VERIFY_SAMPLE = "describes how a reading group keeps a shared notebook";

let screen: FreshScreen;

test.afterEach(async () => {
  await screen?.close();
});

function inventedKey({ id }: Readonly<Vendor>): string {
  return `invented-${id}-key-that-is-not-real-${newSealingKey().slice(0, 12)}`;
}

async function pick(vendor: Readonly<Vendor>): Promise<void> {
  const { page } = screen;
  await expect(
    page.getByLabel(AI_TEXT.provider, { exact: true }).locator(`option[value="${vendor.id}"]`),
  ).toHaveText(vendor.label);
  await page.getByLabel(AI_TEXT.provider, { exact: true }).selectOption(vendor.id);
  await expect(page.getByLabel(AI_TEXT.baseUrl, { exact: true })).toHaveCount(0);
  await expect(page.getByLabel(AI_TEXT.model, { exact: true })).toBeVisible();
  await expect(page.getByLabel(AI_TEXT.key, { exact: true })).toBeVisible();
  await expect(page.locator(`form[action="${AI_SETTINGS_ENDPOINT}"] input`)).toHaveCount(2);
}

async function saveThroughScreen(vendor: Readonly<Vendor>, key: string): Promise<void> {
  const { page } = screen;
  await pick(vendor);
  await page.getByLabel(AI_TEXT.model, { exact: true }).fill(vendor.model);
  await fillKey(page, key);
  await saveAndExpectKeyCleared(page);
}

function readRaw(): Promise<string> {
  return screen.page.evaluate(async (path) => (await fetch(path)).text(), AI_SETTINGS_ENDPOINT);
}

async function proveSavedVendor(vendor: Readonly<Vendor>, secret: string): Promise<void> {
  const { page } = screen;
  const key = inventedKey(vendor);

  expect(
    await putSettings(screen, AiSaveResponseSchema, { provider: vendor.id, model: vendor.model }),
    `${vendor.id} refuses a first save without a key`,
  ).toEqual({ kind: "refused", reason: "key-needed", status: null });

  await saveThroughScreen(vendor, key);

  const raw = await readRaw();

  expect(AiSettingsViewSchema.parse(JSON.parse(raw)).settings).toEqual({
    provider: vendor.id,
    baseUrl: vendor.url,
    model: vendor.model,
    keySet: true,
  });
  assertNoSecret(raw, [key]);
  expect(openSealed(sealedKey(screen), secret) === key, "the sealed key opens to the key").toBe(
    true,
  );
  expect(sealedKey(screen).includes(key), "the database holds no plaintext key").toBe(false);

  await page.reload();
  await expect(page.getByLabel(AI_TEXT.provider, { exact: true })).toHaveValue(vendor.id);
  await expect(page.getByLabel(AI_TEXT.model, { exact: true })).toHaveValue(vendor.model);
  await expect(page.getByLabel(AI_TEXT.baseUrl, { exact: true })).toHaveCount(0);
  await expect(page.getByText(AI_TEXT.keySet, { exact: true })).toBeVisible();
}

test("each vendor row shows only Model and API key, seals the key, and survives a reload", async ({
  browser,
}) => {
  const secret = newSealingKey();
  screen = await aiScreen(browser, secret);
  const { page } = screen;
  await page.goto("/settings");

  for (const vendor of VENDORS) {
    await proveSavedVendor(vendor, secret);
  }

  expect(countRows(screen, "settings")).toBe(1);

  const picker = page.getByLabel(AI_TEXT.provider, { exact: true });

  await picker.selectOption("openai-compatible");
  await expect(page.getByLabel(AI_TEXT.baseUrl, { exact: true })).toHaveValue("");
  await expect(page.getByLabel(AI_TEXT.model, { exact: true })).toBeVisible();
  await expect(page.getByLabel(AI_TEXT.key, { exact: true })).toBeVisible();
  await picker.selectOption("openrouter");
  await expect(page.getByLabel(AI_TEXT.baseUrl, { exact: true })).toHaveCount(0);
  await picker.selectOption("xai");
  await expect(page.getByLabel(AI_TEXT.baseUrl, { exact: true })).toHaveCount(0);
});

async function attachRefusal(vendor: Readonly<Vendor>, info: TestInfo, key: string, raw: string) {
  const log = screen.fresh.logs();

  const tasks = screen.fresh.query(
    "SELECT kind, inputs, executor, provider, model, state, result, refusal, status FROM ai_tasks",
    z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))),
  );

  assertNoSecret(raw, [key]);
  assertNoSecret(log, [key]);
  expect(log.includes(VERIFY_SAMPLE), "the server log holds no Verify request text").toBe(false);
  assertNoSecret(JSON.stringify(tasks), [key]);
  expect(tasks).toMatchObject([
    {
      kind: "digest",
      executor: "http",
      provider: vendor.id,
      model: vendor.model,
      state: "failed",
      refusal: "wrong-key",
      status: vendor.wrongKeyStatus,
    },
  ]);
  await info.attach(`${vendor.id}-verify-refusal`, { body: raw, contentType: "application/json" });
  await info.attach(`${vendor.id}-ai-task-rows`, {
    body: JSON.stringify(tasks),
    contentType: "application/json",
  });
  await info.attach(`${vendor.id}-server-log-bytes`, {
    body: JSON.stringify({ bytes: Buffer.byteLength(log) }),
    contentType: "application/json",
  });
}

async function proveWrongKey(
  browser: Browser,
  vendor: Readonly<Vendor>,
  info: TestInfo,
): Promise<void> {
  screen = await aiScreen(browser, newSealingKey());
  const key = inventedKey(vendor);
  await screen.page.goto("/settings");
  await saveThroughScreen(vendor, key);

  const responded = screen.page.waitForResponse((response) =>
    response.url().endsWith(AI_VERIFY_ENDPOINT),
  );

  await pressKeepingFocus(
    screen.page.getByRole("button", { name: AI_TEXT.verify, exact: true }),
    AI_VERIFY_ENDPOINT,
  );

  const raw = await (await responded).text();

  const refusal = { kind: "refused", reason: "wrong-key", status: vendor.wrongKeyStatus };

  expect(JSON.parse(raw)).toEqual(refusal);
  expect(VerifyResultSchema.parse(JSON.parse(raw))).toEqual(refusal);
  await expect(screen.page.getByText(AI_TEXT["wrong-key"], { exact: true })).toBeVisible();
  expect(countRows(screen, "items")).toBe(0);
  await attachRefusal(vendor, info, key, raw);
}

for (const vendor of VENDORS) {
  test(`Verify with an invented ${vendor.id} key is refused as wrong-key by the real vendor`, async ({
    browser,
  }, info) => {
    await proveWrongKey(browser, vendor, info);
  });
}
