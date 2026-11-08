import { type Locator, type Page, type TestInfo, expect, test } from "@playwright/test";

import { AiSettingsViewSchema } from "../src/core/ai-contract.ts";
import { AI_TEXT } from "../web/src/ai-text.ts";
import {
  AI_SETTINGS_ENDPOINT,
  aiJson,
  aiScreen,
  aiSecretMissing,
  newSealingKey,
  saveInBrowser,
} from "./ai.ts";
import { BANDS_AT_WIDTH, THEMES, expectNoViolations, resize } from "./design-screens.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { storeSettings } from "./look.ts";
import { isContainerTarget } from "./target.ts";

type Screens = Readonly<Record<"screen" | "saved" | "missing" | "keyless", FreshScreen>>;

async function prepare({ saved, keyless }: Screens): Promise<void> {
  if (!isContainerTarget()) {
    await keyless.page.goto("/settings");
    await aiJson(
      keyless,
      AiSettingsViewSchema,
      "PUT",
      AI_SETTINGS_ENDPOINT,
      JSON.stringify({ provider: "workers-ai", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" }),
    );
  }

  await saveInBrowser(saved, "design-proof-key", "https://threadsift-ai-design.invalid", "example");
}

async function checkTheme(screens: Screens, info: TestInfo, theme: string): Promise<void> {
  const { screen } = screens;

  for (const current of Object.values(screens))
    await storeSettings(current.page, { theme }, "/settings");

  if (!isContainerTarget()) {
    await expect(screen.page.getByText(AI_TEXT.publicUrlHelp, { exact: true })).toBeVisible();
    await expect(screen.page.getByLabel(AI_TEXT.baseUrl, { exact: true })).toHaveAttribute(
      "pattern",
      "https://.+",
    );
  }

  const section = screen.page.getByRole("region", { name: AI_TEXT.title, exact: true });
  await expect(section.getByLabel(AI_TEXT.provider, { exact: true })).toBeVisible();

  for (const [width, bands] of BANDS_AT_WIDTH) {
    await resize(screen.page, width, bands);
    await expectNoViolations(screen.page, `AI settings, ${theme}, ${width}px`);
    await capture(screen.page, info, `ai-${theme}-${width}.png`);
    await section.getByLabel(AI_TEXT.provider, { exact: true }).selectOption("openrouter");
    await expect(section.getByLabel(AI_TEXT.baseUrl, { exact: true })).toHaveCount(0);
    await expectNoViolations(screen.page, `OpenRouter settings, ${theme}, ${width}px`);
    await capture(screen.page, info, `openrouter-${theme}-${width}.png`);
    await section.getByLabel(AI_TEXT.provider, { exact: true }).selectOption("openai-compatible");
    await checkWorkersAi(section, screen.page, info, { theme, width });
    await checkStates(screens, info, { theme, width, bands });
  }
}

test("AI settings and the Provider rows keep the design rules in every theme and width", async ({
  browser,
}, info) => {
  test.setTimeout(240_000);

  const screens: Screens = {
    screen: await aiScreen(browser, newSealingKey()),
    saved: await aiScreen(browser, newSealingKey()),
    missing: await aiScreen(browser),
    keyless: await aiScreen(browser),
  };

  try {
    await prepare(screens);

    for (const theme of THEMES) await checkTheme(screens, info, theme);
  } finally {
    for (const current of Object.values(screens)) await current.close();
  }
});

async function capture(page: Page, info: TestInfo, name: string): Promise<void> {
  const size = page.viewportSize();

  if (size === null) throw new Error("Missing viewport");
  await page.setViewportSize({ width: size.width, height: 1200 });
  await page.locator(".pg").evaluate((element) => {
    element.scrollTop = 0;
  });
  await page
    .getByRole("region", { name: AI_TEXT.title, exact: true })
    .screenshot({ path: info.outputPath(name) });
}

async function checkWorkersAi(
  section: Locator,
  page: Page,
  info: TestInfo,
  { theme, width }: Readonly<{ theme: string; width: number }>,
): Promise<void> {
  const picker = section.getByLabel(AI_TEXT.provider, { exact: true });

  if (isContainerTarget()) {
    await expect(picker.locator("option", { hasText: AI_TEXT.workersAi })).toHaveCount(0);

    return;
  }

  await picker.selectOption("workers-ai");
  await expect(section.getByLabel(AI_TEXT.baseUrl, { exact: true })).toHaveCount(0);
  await expect(section.getByLabel(AI_TEXT.key, { exact: true })).toHaveCount(0);
  await expect(section.getByText(AI_TEXT.workersAiHelp, { exact: true })).toBeVisible();
  await expectNoViolations(page, `Workers AI settings, ${theme}, ${width}px`);
  await capture(page, info, `workers-ai-${theme}-${width}.png`);
  await picker.selectOption("openai-compatible");
}

async function checkKeyless(
  keyless: FreshScreen,
  info: TestInfo,
  { theme, width, bands }: Readonly<{ theme: string; width: number; bands: string }>,
): Promise<void> {
  await keyless.page.reload();
  await resize(keyless.page, width, bands);
  await expect(keyless.page.getByLabel(AI_TEXT.provider, { exact: true })).toHaveValue(
    "workers-ai",
  );
  await expect(keyless.page.getByText(AI_TEXT.keyNotNeeded, { exact: true })).toBeVisible();
  await expect(aiSecretMissing(keyless.page)).toHaveCount(0);
  await expectNoViolations(keyless.page, `Keyless Workers AI, ${theme}, ${width}px`);
  await capture(keyless.page, info, `keyless-${theme}-${width}.png`);
}

async function checkStates(
  { saved, missing, keyless }: Screens,
  info: TestInfo,
  { theme, width, bands }: Readonly<{ theme: string; width: number; bands: string }>,
): Promise<void> {
  if (!isContainerTarget()) await checkKeyless(keyless, info, { theme, width, bands });

  await saved.page.reload();
  await resize(saved.page, width, bands);
  await expect(saved.page.getByText(AI_TEXT.keySet, { exact: true })).toBeVisible();
  await expectNoViolations(saved.page, `Saved AI key, ${theme}, ${width}px`);
  await capture(saved.page, info, `saved-${theme}-${width}.png`);
  await saved.page.getByRole("button", { name: AI_TEXT.verify, exact: true }).click();
  await expect(saved.page.getByRole("alert")).toHaveText(AI_TEXT.unreachable);
  await expectNoViolations(saved.page, `AI refusal, ${theme}, ${width}px`);
  await capture(saved.page, info, `refusal-${theme}-${width}.png`);
  await resize(missing.page, width, bands);
  await expect(aiSecretMissing(missing.page)).toBeVisible();
  await expectNoViolations(missing.page, `Missing sealing key, ${theme}, ${width}px`);
  await capture(missing.page, info, `missing-${theme}-${width}.png`);
}
