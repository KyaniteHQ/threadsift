import { test } from "@playwright/test";

import { THEMES, resize } from "./design-screens.ts";
import { expectDesign } from "./highlight-design.ts";
import { openReader } from "./highlight-reader.ts";
import { screenForFile, seededItem } from "./highlight-screen.ts";
import { attachScreenshot } from "./look.ts";

const screenOf = screenForFile(600_000);

const WIDTHS = [
  [1440, "full"],
  [390, "phone narrow medium wide full"],
] as const;

for (const forced of [false, true]) {
  test(`marks, the Keep panel and the list break no design rule in Light, Dark and Sepia at 1440 and 390 px${forced ? " in forced colours" : ""}`, async () => {
    const { page } = screenOf();
    const info = test.info();
    const id = await seededItem(screenOf(), forced ? "df" : "dn");
    await page.emulateMedia({ forcedColors: forced ? "active" : "none" });

    for (const theme of THEMES) {
      for (const [width, bands] of WIDTHS) {
        const name = `${theme} at ${width}px${forced ? " forced" : ""}`;
        await openReader(page, id, width, { theme });
        await resize(page, width, bands);
        await expectDesign(page, name, { forced, narrow: width < 480 });
        await attachScreenshot(
          page,
          info,
          `highlights-${theme}-${width}${forced ? "-forced" : ""}`,
        );
      }
    }

    await page.emulateMedia({ forcedColors: "none" });
  });
}
