import { type Locator, type Page, expect, test } from "@playwright/test";

import { HIGHLIGHTS_PAGE } from "../web/src/highlights-page-text.ts";
import { THEMES, expectNoViolations, resize } from "./design-screens.ts";
import { screenForFile } from "./highlight-screen.ts";
import { expectAccessible, shoot, walkStates } from "./highlights-page-design.ts";
import { buildLibrary, keepWords } from "./highlights-page-seed.ts";
import { openPage } from "./highlights-page-ui.ts";
import { openPanel, storeSettings } from "./look.ts";

const screenOf = screenForFile(900_000);

const PANEL_TAB_STOPS = 40;

async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let press = 0; press < PANEL_TAB_STOPS; press += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;

    await page.keyboard.press("Tab");
  }

  await expect(target).toBeFocused();
}

const WIDTHS = [
  [1440, "full"],
  [390, "phone narrow medium wide full"],
] as const;

test.beforeAll(async () => {
  await buildLibrary(screenOf());
  await keepWords(screenOf(), "dw", 60);
});

for (const forced of [false, true]) {
  test(`the Highlights page breaks no design rule in its loading, list, failed Load more, no results and failed states in Light, Dark and Sepia at 1440 and 390 px${forced ? " in forced colours" : ""}`, async () => {
    const { page } = screenOf();
    const info = test.info();
    await page.emulateMedia({ forcedColors: forced ? "active" : "none" });

    for (const theme of THEMES) {
      for (const [width, bands] of WIDTHS) {
        const name = `${theme} at ${width}px${forced ? " forced" : ""}`;
        await openPage(page, width, { theme });
        await resize(page, width, bands);

        await walkStates(page, name, { forced, width }, (state) =>
          shoot(page, info, `highlights-${theme}-${width}${forced ? "-forced" : ""}-${state}`),
        );
      }
    }

    await page.emulateMedia({ forcedColors: "none" });
  });
}

test("the Highlights link in the settings panel is visible, takes the focus from the Tab key and breaks no design rule in Light, Dark and Sepia at every width", async () => {
  const { page } = screenOf();

  for (const theme of THEMES) {
    for (const [width, bands] of WIDTHS) {
      const name = `the panel in ${theme} at ${width}px`;
      await storeSettings(page, { theme }, "/");
      await resize(page, width, bands);
      const dialog = await openPanel(page);
      const link = dialog.getByRole("link", { name: HIGHLIGHTS_PAGE.masthead, exact: true });

      await expect(link, `${name}: the Highlights link`).toBeVisible();
      await tabTo(page, link);
      await expect(link).toBeFocused();
      await expect(link, `${name}: the Highlights link shows its focus`).toHaveCSS(
        "outline-style",
        "solid",
      );
      await expectNoViolations(page, name);
      await expectAccessible(page, name, ".st-more");
      await page.keyboard.press("Escape");
    }
  }
});
