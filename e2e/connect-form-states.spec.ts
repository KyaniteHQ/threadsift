import { type Page, expect, test } from "@playwright/test";

import { AiSaveResponseSchema } from "../src/core/ai-contract.ts";
import { AI_TEXT } from "../web/src/ai-text.ts";
import { putSettings } from "./ai.ts";
import {
  START,
  MODEL,
  type ConnectScreen,
  attemptCount,
  connectScreen,
  settingsRows,
} from "./connect.ts";

test.use({ trace: "off", video: "off" });

test.describe.configure({ timeout: 120_000 });

const TYPED_KEY = "typed-key-proof";

function aiSection(page: Page) {
  return page.getByRole("region", { name: AI_TEXT.title, exact: true });
}

function button(page: Page, name: string) {
  return aiSection(page).getByRole("button", { name, exact: true });
}

async function withScreen(
  browser: Parameters<typeof connectScreen>[0],
  work: (screen: ConnectScreen) => Promise<void>,
): Promise<void> {
  const screen = await connectScreen(browser);

  try {
    await work(screen);
  } finally {
    await screen.close();
  }
}

test("a saved key counts as saved only for the Provider, URL and model it was saved with", async ({
  browser,
}) => {
  await withScreen(browser, async (screen) => {
    const { page } = screen;
    await page.goto("/settings");
    await putSettings(screen, AiSaveResponseSchema, {
      provider: "anthropic",
      model: "claude-proof-model",
      key: TYPED_KEY,
    });
    await page.goto("/settings");

    const section = aiSection(page);
    const picker = section.getByLabel(AI_TEXT.provider, { exact: true });
    const model = section.getByLabel(AI_TEXT.model, { exact: true });
    const key = section.getByLabel(AI_TEXT.key, { exact: true });

    await expect(section.getByText(AI_TEXT.keySet, { exact: true })).toBeVisible();
    await expect(key).not.toHaveAttribute("required", "");

    await picker.selectOption("openrouter");
    await expect(section.getByText(AI_TEXT.keyChanged, { exact: true })).toBeVisible();
    await expect(section.getByText(AI_TEXT.keySet, { exact: true })).toHaveCount(0);
    await expect(key).toHaveAttribute("required", "");

    await picker.selectOption("anthropic");
    await expect(section.getByText(AI_TEXT.keySet, { exact: true })).toBeVisible();

    await model.fill("another-model");
    await expect(section.getByText(AI_TEXT.keyChanged, { exact: true })).toBeVisible();
    await model.fill("claude-proof-model");
    await expect(section.getByText(AI_TEXT.keySet, { exact: true })).toBeVisible();
  });
});

test("a saved key for an OpenAI-compatible URL counts as saved for the same URL, trailing slash or not", async ({
  browser,
}) => {
  await withScreen(browser, async (screen) => {
    const { page } = screen;
    await page.goto("/settings");
    await putSettings(screen, AiSaveResponseSchema, {
      provider: "openai-compatible",
      baseUrl: "https://example.com/v1",
      model: "compatible-proof-model",
      key: TYPED_KEY,
    });
    await page.goto("/settings");

    const section = aiSection(page);
    const url = section.getByLabel(AI_TEXT.baseUrl, { exact: true });

    await expect(section.getByText(AI_TEXT.keySet, { exact: true })).toBeVisible();
    await url.fill("https://example.com/v1/");
    await expect(section.getByText(AI_TEXT.keySet, { exact: true })).toBeVisible();
    await url.fill("https://example.org/v1");
    await expect(section.getByText(AI_TEXT.keyChanged, { exact: true })).toBeVisible();
  });
});

test("Connect starts nothing while it shows as unavailable because the sealing key is missing", async ({
  browser,
}) => {
  await withScreen(browser, async (screen) => {
    const { page } = screen;
    screen.fresh.restart({ THREADSIFT_PUBLIC_ORIGIN: screen.origin });
    const starts: string[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith(START)) starts.push(request.url());
    });

    await page.goto("/settings");
    const section = aiSection(page);
    await section.getByLabel(AI_TEXT.provider, { exact: true }).selectOption("openrouter");
    await section.getByLabel(AI_TEXT.model, { exact: true }).fill(MODEL);
    await expect(button(page, AI_TEXT.connect)).toHaveAttribute("aria-disabled", "true");

    await button(page, AI_TEXT.connect).click({ force: true });
    await expect(section.getByText(AI_TEXT["secret-missing"], { exact: true })).toBeVisible();
    await page.evaluate(() => null);

    expect(starts, "the Connect press sent a start request").toEqual([]);
    expect(attemptCount(screen), "the Connect press made an attempt").toBe(0);
    await expect(button(page, AI_TEXT.connect)).toBeVisible();
  });
});

test("Save and Verify wait while Connect leaves the page, and a navigation that never arrives returns the form to idle", async ({
  browser,
}) => {
  await withScreen(browser, async (screen) => {
    const { page } = screen;
    await page.clock.install();
    await page.route("https://openrouter.ai/auth?**", (route) => route.abort("aborted"));
    await page.goto("/settings");

    const section = aiSection(page);
    await section.getByLabel(AI_TEXT.provider, { exact: true }).selectOption("openrouter");
    await section.getByLabel(AI_TEXT.model, { exact: true }).fill(MODEL);
    await section.getByLabel(AI_TEXT.key, { exact: true }).fill(TYPED_KEY);
    await button(page, AI_TEXT.connect).click();
    await expect(button(page, AI_TEXT.connecting)).toBeVisible();
    await expect(button(page, AI_TEXT.save)).toHaveAttribute("aria-disabled", "true");
    await expect(button(page, AI_TEXT.verify)).toHaveAttribute("aria-disabled", "true");

    await button(page, AI_TEXT.save).click({ force: true });
    await page.clock.fastForward(5_000);
    await expect(button(page, AI_TEXT.saving)).toBeHidden();
    expect(settingsRows(screen), "Save wrote while Connect was leaving").toBe(0);

    await page.clock.fastForward(10_000);
    await expect(button(page, AI_TEXT.connect)).toBeVisible();
    await expect(button(page, AI_TEXT.connect)).not.toHaveAttribute("aria-disabled", "true");
    await expect(button(page, AI_TEXT.save)).not.toHaveAttribute("aria-disabled", "true");
    await expect(section.getByRole("alert")).toHaveCount(0);
  });
});

test("an arrival notice is gone once the owner saves or verifies", async ({ browser }) => {
  await withScreen(browser, async (screen) => {
    const { page } = screen;
    await page.goto("/settings");
    await putSettings(screen, AiSaveResponseSchema, {
      provider: "openrouter",
      model: MODEL,
      key: TYPED_KEY,
    });

    await page.goto("/settings?openrouter=connected");
    const section = aiSection(page);
    await expect(section.getByText(AI_TEXT.connected, { exact: true })).toBeVisible();

    await section.getByLabel(AI_TEXT.provider, { exact: true }).selectOption("anthropic");
    await section.getByLabel(AI_TEXT.model, { exact: true }).fill("claude-proof-model");
    await section.getByLabel(AI_TEXT.key, { exact: true }).fill(TYPED_KEY);
    await button(page, AI_TEXT.save).click();
    await expect(section.getByText(AI_TEXT.saved, { exact: true })).toBeVisible();
    await expect(section.getByText(AI_TEXT.connected, { exact: true })).toHaveCount(0);
    await expect(section.getByText(AI_TEXT.connectIncomplete, { exact: true })).toHaveCount(0);

    await putSettings(screen, AiSaveResponseSchema, {
      provider: "openrouter",
      model: MODEL,
      key: TYPED_KEY,
    });
    await page.goto("/settings?openrouter=activation-pending");
    await expect(
      section.getByText(AI_TEXT.connectActivationPending, { exact: true }),
    ).toBeVisible();

    await button(page, AI_TEXT.verify).click();
    await expect(section.getByText(AI_TEXT.connectActivationPending, { exact: true })).toHaveCount(
      0,
    );
  });
});
