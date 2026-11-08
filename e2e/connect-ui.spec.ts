import { expect, test } from "@playwright/test";

import { AiSaveResponseSchema } from "../src/core/ai-contract.ts";
import { AI_TEXT } from "../web/src/ai-text.ts";
import { putSettings } from "./ai.ts";
import { MODEL, connectScreen } from "./connect.ts";
import { BANDS_AT_WIDTH, THEMES, expectNoViolations, resize } from "./design-screens.ts";
import { storeSettings } from "./look.ts";

test.describe.configure({ mode: "serial", timeout: 240_000 });

const NOTICES = [
  ["incomplete", AI_TEXT.connectIncomplete],
  ["settings-changed", AI_TEXT.connectSettingsChanged],
  ["possible-orphan", AI_TEXT.connectPossibleOrphan],
  ["connected", AI_TEXT.connectIncomplete],
] as const;

test("Settings shows a closed notice once, takes it out of the address, and says connected only when the saved settings hold an OpenRouter key", async ({
  browser,
}) => {
  const screen = await connectScreen(browser);

  try {
    const { page } = screen;

    for (const [notice, text] of NOTICES) {
      await page.goto(`/settings?openrouter=${notice}`);
      await expect(page.getByText(text, { exact: true })).toBeVisible();
      await expect(page).toHaveURL(`${screen.origin}/settings`);
      await page.reload();
      await expect(page.getByRole("region", { name: AI_TEXT.title, exact: true })).toBeVisible();
      await expect(page.getByText(text, { exact: true })).toHaveCount(0);
    }

    await page.goto("/settings?openrouter=something-else");
    await expect(page.getByRole("region", { name: AI_TEXT.title, exact: true })).toBeVisible();

    for (const [, text] of NOTICES)
      await expect(page.getByText(text, { exact: true })).toHaveCount(0);

    await putSettings(screen, AiSaveResponseSchema, {
      provider: "openrouter",
      model: MODEL,
      key: "typed-key-proof",
    });

    await page.goto("/settings?openrouter=connected");
    await expect(page.getByText(AI_TEXT.connected, { exact: true })).toBeVisible();
  } finally {
    await screen.close();
  }
});

test("The model field follows the saved Provider: another Provider's model is not offered to OpenRouter", async ({
  browser,
}) => {
  const screen = await connectScreen(browser);

  try {
    const { page } = screen;
    await page.goto("/settings");

    await putSettings(screen, AiSaveResponseSchema, {
      provider: "anthropic",
      model: "claude-proof-model",
      key: "typed-key-proof",
    });

    await page.goto("/settings");
    const section = page.getByRole("region", { name: AI_TEXT.title, exact: true });
    const picker = section.getByLabel(AI_TEXT.provider, { exact: true });
    const model = section.getByLabel(AI_TEXT.model, { exact: true });

    await expect(model).toHaveValue("claude-proof-model");
    await picker.selectOption("openrouter");
    await expect(model).toHaveValue("");
    await picker.selectOption("anthropic");
    await expect(model).toHaveValue("claude-proof-model");

    await putSettings(screen, AiSaveResponseSchema, {
      provider: "openrouter",
      model: MODEL,
      key: "typed-key-proof",
    });

    await page.goto("/settings");
    await expect(model).toHaveValue(MODEL);
    await picker.selectOption("anthropic");
    await expect(model).toHaveValue("");
  } finally {
    await screen.close();
  }
});

test("The Connect button and its notes keep the design rules in every theme and width", async ({
  browser,
}) => {
  const screen = await connectScreen(browser);

  try {
    const { page } = screen;

    for (const theme of THEMES) {
      await storeSettings(page, { theme }, "/settings?openrouter=possible-orphan");
      const section = page.getByRole("region", { name: AI_TEXT.title, exact: true });
      await section.getByLabel(AI_TEXT.provider, { exact: true }).selectOption("openrouter");
      await expect(
        section.getByRole("button", { name: AI_TEXT.connect, exact: true }),
      ).toBeVisible();
      await expect(section.getByText(AI_TEXT.connectHelp, { exact: true })).toBeVisible();

      for (const [width, bands] of BANDS_AT_WIDTH) {
        await resize(page, width, bands);
        await expectNoViolations(page, `Connect, ${theme}, ${width}px`);
      }
    }
  } finally {
    await screen.close();
  }
});
