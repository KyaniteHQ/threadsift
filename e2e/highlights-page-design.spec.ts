import { test } from "@playwright/test";

import { THEMES, expectNoViolations, resize } from "./design-screens.ts";
import { screenForFile } from "./highlight-screen.ts";
import { expectAccessible, shoot, walkStates } from "./highlights-page-design.ts";
import { buildLibrary, keepWords } from "./highlights-page-seed.ts";
import { openPage } from "./highlights-page-ui.ts";
import { openPanel, storeSettings } from "./look.ts";

const screenOf = screenForFile(900_000);

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

test("the Highlights link in the settings panel breaks no design rule in Light, Dark and Sepia at every width", async () => {
  const { page } = screenOf();

  for (const theme of THEMES) {
    for (const [width, bands] of WIDTHS) {
      const name = `the panel in ${theme} at ${width}px`;
      await storeSettings(page, { theme }, "/");
      await resize(page, width, bands);
      await openPanel(page);
      await expectNoViolations(page, name);
      await expectAccessible(page, name, ".st-more");
      await page.keyboard.press("Escape");
    }
  }
});
