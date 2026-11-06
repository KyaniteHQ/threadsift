import { type Page, type TestInfo, expect, test } from "@playwright/test";

import { AI_TEXT } from "../web/src/ai-text.ts";
import { aiScreen, newSealingKey, saveInBrowser } from "./ai.ts";
import { BANDS_AT_WIDTH, THEMES, expectNoViolations, resize } from "./design-screens.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { storeSettings } from "./look.ts";
import { isContainerTarget } from "./target.ts";

test("AI settings and both Provider rows keep the design rules in every theme and width", async ({
  browser,
}, info) => {
  test.setTimeout(240_000);
  const screen = await aiScreen(browser, newSealingKey());
  const saved = await aiScreen(browser, newSealingKey());
  const missing = await aiScreen(browser);

  try {
    await saveInBrowser(
      saved,
      "design-proof-key",
      "https://threadsift-ai-design.invalid",
      "example",
    );

    for (const theme of THEMES) {
      for (const current of [screen, saved, missing])
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
        await section
          .getByLabel(AI_TEXT.provider, { exact: true })
          .selectOption("openai-compatible");
        await checkStates(saved, missing, info, { theme, width, bands });
      }
    }
  } finally {
    for (const current of [screen, saved, missing]) await current.close();
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

async function checkStates(
  saved: FreshScreen,
  missing: FreshScreen,
  info: TestInfo,
  { theme, width, bands }: Readonly<{ theme: string; width: number; bands: string }>,
): Promise<void> {
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
  await expect(missing.page.getByText(AI_TEXT["secret-missing"], { exact: true })).toBeVisible();
  await expectNoViolations(missing.page, `Missing sealing key, ${theme}, ${width}px`);
  await capture(missing.page, info, `missing-${theme}-${width}.png`);
}
