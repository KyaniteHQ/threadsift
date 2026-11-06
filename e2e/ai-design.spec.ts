import { expect, test } from "@playwright/test";

import { AI_TEXT } from "../web/src/ai-text.ts";
import { aiScreen, newSealingKey } from "./ai.ts";
import { BANDS_AT_WIDTH, THEMES, expectNoViolations, resize } from "./design-screens.ts";
import { storeSettings } from "./look.ts";
import { isContainerTarget } from "./target.ts";

test("AI settings and both Provider rows keep the design rules in every theme and width", async ({
  browser,
}, info) => {
  test.setTimeout(180_000);
  const screen = await aiScreen(browser, newSealingKey());

  try {
    for (const theme of THEMES) {
      await storeSettings(screen.page, { theme }, "/settings");

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
        await screen.page.setViewportSize({ width, height: 1200 });
        await screen.page.locator(".pg").evaluate((element) => {
          element.scrollTop = 0;
        });
        await section.screenshot({ path: info.outputPath(`ai-${theme}-${width}.png`) });
        await section.getByLabel(AI_TEXT.provider, { exact: true }).selectOption("openrouter");
        await expect(section.getByLabel(AI_TEXT.baseUrl, { exact: true })).toHaveCount(0);
        await expectNoViolations(screen.page, `OpenRouter settings, ${theme}, ${width}px`);
        await section.screenshot({ path: info.outputPath(`openrouter-${theme}-${width}.png`) });
        await section
          .getByLabel(AI_TEXT.provider, { exact: true })
          .selectOption("openai-compatible");
      }
    }
  } finally {
    await screen.close();
  }
});
