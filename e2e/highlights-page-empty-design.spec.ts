import { expect, test } from "@playwright/test";

import { HIGHLIGHTS_PAGE } from "../web/src/highlights-page-text.ts";
import { THEMES, resize } from "./design-screens.ts";
import { screenForFile } from "./highlight-screen.ts";
import { check, shoot } from "./highlights-page-design.ts";
import { entries, openPage } from "./highlights-page-ui.ts";

const screenOf = screenForFile();

const WIDTHS = [
  [1440, "full"],
  [390, "phone narrow medium wide full"],
] as const;

for (const forced of [false, true]) {
  test(`the Highlights page of an Instance with no Highlight and no Note breaks no design rule in Light, Dark and Sepia at 1440 and 390 px${forced ? " in forced colours" : ""}`, async () => {
    const { page } = screenOf();
    const info = test.info();
    await page.emulateMedia({ forcedColors: forced ? "active" : "none" });

    for (const theme of THEMES) {
      for (const [width, bands] of WIDTHS) {
        const name = `${theme} at ${width}px${forced ? " forced" : ""} empty`;
        await openPage(page, width, { theme });
        await resize(page, width, bands);
        await expect(page.getByText(HIGHLIGHTS_PAGE.emptyHeading)).toBeVisible();
        await expect(entries(page)).toHaveCount(0);
        await check(page, name, { forced, width });
        await shoot(page, info, `highlights-empty-${theme}-${width}${forced ? "-forced" : ""}`);
      }
    }

    await page.emulateMedia({ forcedColors: "none" });
  });
}
