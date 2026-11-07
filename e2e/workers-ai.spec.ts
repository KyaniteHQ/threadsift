import { expect, test } from "@playwright/test";
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
  aiJson,
  aiScreen,
  aiSecretMissing,
  countRows,
  newSealingKey,
  saveInBrowser,
} from "./ai.ts";
import { postLinkRaw, settled } from "./api.ts";
import { ESSAY } from "./articles.ts";
import { jobsOf } from "./ingest.ts";
import { isContainerTarget } from "./target.ts";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const HTTP_PROVIDER_IDS = ["openai-compatible", "openrouter", "anthropic", "openai", "xai"];

const KEYLESS_ROW = {
  provider: "workers-ai",
  base_url: null,
  model: MODEL,
  sealed_key: null,
} as const;

const Settings = z.array(
  z.object({
    provider: z.string(),
    base_url: z.string().nullable(),
    model: z.string(),
    sealed_key: z.string().nullable(),
  }),
);

const Tasks = z.array(
  z.object({
    executor: z.string(),
    provider: z.string().nullable(),
    model: z.string().nullable(),
    state: z.string(),
    refusal: z.string().nullable(),
    status: z.number().nullable(),
  }),
);

test.use({ trace: "off", video: "off", screenshot: "off" });

test.describe.configure({ mode: "serial", timeout: 240_000 });

let screen: Awaited<ReturnType<typeof aiScreen>>;

test.afterEach(async () => {
  await screen?.close();
});

function storedSettings() {
  return screen.fresh.query("SELECT provider, base_url, model, sealed_key FROM settings", Settings);
}

function storedTasks() {
  return screen.fresh.query(
    "SELECT executor, provider, model, state, refusal, status FROM ai_tasks ORDER BY id",
    Tasks,
  );
}

async function saveWorkersAi(): Promise<void> {
  const { page } = screen;
  await page.goto("/settings");

  const picker = page.getByLabel(AI_TEXT.provider, { exact: true });
  await expect(picker.locator("option")).toHaveText([
    AI_TEXT.compatible,
    AI_TEXT.openrouter,
    AI_TEXT.anthropic,
    AI_TEXT.openai,
    AI_TEXT.xai,
    AI_TEXT.workersAi,
  ]);
  await picker.selectOption("workers-ai");
  await expect(page.getByLabel(AI_TEXT.baseUrl, { exact: true })).toHaveCount(0);
  await expect(page.getByLabel(AI_TEXT.key, { exact: true })).toHaveCount(0);
  await expect(page.getByText(AI_TEXT.workersAiHelp, { exact: true })).toBeVisible();
  await expect(page.getByText(AI_TEXT.keyNotNeeded, { exact: true })).toBeVisible();
  await expect(aiSecretMissing(page)).toHaveCount(0);
  await page.getByLabel(AI_TEXT.model, { exact: true }).fill(MODEL);

  const sent = page.waitForRequest(
    (request) => request.method() === "PUT" && request.url().endsWith(AI_SETTINGS_ENDPOINT),
  );

  await page.getByRole("button", { name: AI_TEXT.save, exact: true }).click();
  expect(JSON.parse((await sent).postData() ?? "")).toEqual({
    provider: "workers-ai",
    model: MODEL,
  });
  await expect(page.getByText(AI_TEXT.saved, { exact: true })).toBeVisible();
}

test("Workers AI saves with only a model and no sealing key, seals nothing, and a failed Verify still records the connection it loaded", async ({
  browser,
}) => {
  test.skip(isContainerTarget(), "the container never offers Workers AI");
  screen = await aiScreen(browser);
  const { page } = screen;
  await saveWorkersAi();
  expect(storedSettings()).toEqual([KEYLESS_ROW]);

  await page.reload();
  await expect(page.getByLabel(AI_TEXT.provider, { exact: true })).toHaveValue("workers-ai");
  await expect(page.getByLabel(AI_TEXT.model, { exact: true })).toHaveValue(MODEL);
  await page.getByRole("button", { name: AI_TEXT.verify, exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(AI_TEXT.unreachable);

  expect(storedTasks()).toEqual([
    {
      executor: "binding",
      provider: "workers-ai",
      model: MODEL,
      state: "failed",
      refusal: "unreachable",
      status: null,
    },
  ]);
});

test("switching from an HTTP Provider with a saved key to Workers AI and back asks for the key again, and a typed key is dropped", async ({
  browser,
}) => {
  test.skip(isContainerTarget(), "the container never offers Workers AI");
  screen = await aiScreen(browser, newSealingKey());
  const { page } = screen;
  await saveInBrowser(screen, "switch-proof-key", "https://example.com", "http-model");
  const keyField = page.getByLabel(AI_TEXT.key, { exact: true });
  const picker = page.getByLabel(AI_TEXT.provider, { exact: true });

  await keyField.fill("typed-and-not-saved");
  await picker.selectOption("workers-ai");
  await picker.selectOption("openai-compatible");
  await expect(keyField).toHaveValue("");

  await picker.selectOption("workers-ai");
  await page.getByLabel(AI_TEXT.model, { exact: true }).fill(MODEL);
  await page.getByRole("button", { name: AI_TEXT.save, exact: true }).click();
  await expect(page.getByText(AI_TEXT.saved, { exact: true })).toBeVisible();
  expect(storedSettings()).toEqual([KEYLESS_ROW]);

  await picker.selectOption("openai-compatible");
  await expect(keyField).toHaveAttribute("required", "");
  await expect(page.getByText(AI_TEXT.keyMissing, { exact: true })).toBeVisible();
  await page.getByLabel(AI_TEXT.baseUrl, { exact: true }).fill("https://example.com");
  await page.getByLabel(AI_TEXT.model, { exact: true }).fill("http-model");
  await page.getByRole("button", { name: AI_TEXT.save, exact: true }).click();
  expect(await keyField.evaluate((input) => input.matches(":invalid"))).toBe(true);
  expect(storedSettings()).toEqual([KEYLESS_ROW]);

  expect(
    await aiJson(
      screen,
      AiSaveResponseSchema,
      "PUT",
      AI_SETTINGS_ENDPOINT,
      JSON.stringify({
        provider: "openai-compatible",
        baseUrl: "https://example.com",
        model: "http-model",
      }),
    ),
  ).toEqual({ kind: "refused", reason: "key-needed", status: null });
  expect(storedSettings()).toEqual([KEYLESS_ROW]);
});

async function refuseStoredRow(): Promise<void> {
  screen.fresh.sql("DELETE FROM settings");
  screen.fresh.sql(
    `INSERT INTO settings (id, provider, model, base_url, sealed_key) VALUES (1, 'workers-ai', '${MODEL}', NULL, NULL)`,
  );
  await screen.page.reload();
  const stored = await aiJson(screen, AiSettingsViewSchema, "GET", AI_SETTINGS_ENDPOINT);
  expect(stored.settings).toEqual({ provider: "workers-ai", model: MODEL });
  expect(stored.providers).toEqual(HTTP_PROVIDER_IDS);

  expect(await aiJson(screen, VerifyResultSchema, "POST", AI_VERIFY_ENDPOINT)).toEqual({
    kind: "refused",
    reason: "provider-unavailable",
    status: null,
  });
  expect(storedTasks()).toEqual([
    {
      executor: "binding",
      provider: "workers-ai",
      model: MODEL,
      state: "failed",
      refusal: "provider-unavailable",
      status: null,
    },
  ]);
}

test("the container leaves Workers AI out, answers 400 to a save that names it, and changes nothing", async ({
  browser,
}) => {
  test.skip(!isContainerTarget(), "the Worker offers Workers AI");
  screen = await aiScreen(browser, newSealingKey());
  const { page, context } = screen;
  const item = await postLinkRaw(context.request, ESSAY);
  const older = await settled(context.request, item.body.item.id);
  expect(older.postText?.length).toBeGreaterThan(100);

  await page.goto("/settings");
  const view = await aiJson(screen, AiSettingsViewSchema, "GET", AI_SETTINGS_ENDPOINT);
  expect(view.providers).toEqual(HTTP_PROVIDER_IDS);
  await expect(page.getByLabel(AI_TEXT.provider, { exact: true }).locator("option")).toHaveText([
    AI_TEXT.compatible,
    AI_TEXT.openrouter,
    AI_TEXT.anthropic,
    AI_TEXT.openai,
    AI_TEXT.xai,
  ]);

  const refused = await context.request.put(AI_SETTINGS_ENDPOINT, {
    data: { provider: "workers-ai", model: MODEL },
  });

  expect(refused.status()).toBe(400);
  expect(countRows(screen, "settings")).toBe(0);
  expect(countRows(screen, "ai_tasks")).toBe(0);
  expect(jobsOf(older.id, screen.fresh, "digest")).toEqual([]);

  await saveInBrowser(screen, "container-proof-key", "https://example.com", "http-model");
  expect(jobsOf(older.id, screen.fresh, "digest")).toHaveLength(1);
});

test("the container refuses a stored Workers AI row, records a failed task for each Verify, and the form says so", async ({
  browser,
}) => {
  test.skip(!isContainerTarget(), "the Worker offers Workers AI");
  screen = await aiScreen(browser, newSealingKey());
  await screen.page.goto("/settings");
  await refuseStoredRow();
  await screen.page.getByRole("button", { name: AI_TEXT.verify, exact: true }).click();
  await expect(screen.page.getByRole("alert")).toHaveText(AI_TEXT["provider-unavailable"]);
  expect(countRows(screen, "ai_tasks")).toBe(2);
});
