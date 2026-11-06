import { type Page, expect, test } from "@playwright/test";

import { SEARCH_LABEL } from "../web/src/text.ts";
import { newCode, newPassword } from "./access.ts";
import { BANDS_AT_WIDTH, THEMES, expectNoViolations, resize } from "./design-screens.ts";
import { type Library, buildLibrary, choice, expectRows } from "./filters.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { attachScreenshot, storeSettings } from "./look.ts";

let screen: FreshScreen;
let library: Library;

test.describe.configure({ timeout: 480_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

test.beforeAll(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
  library = await buildLibrary(screen);
});

test.afterAll(async () => {
  await screen.close();
});

async function openPane(page: Page): Promise<void> {
  const toggle = page.getByRole("button", { name: /^Filters/u });

  if ((await toggle.count()) > 0 && (await toggle.getAttribute("aria-expanded")) === "false") {
    await toggle.click();
  }

  await expect(page.getByRole("group", { name: "Source", exact: true })).toBeVisible();
}

async function checkState(page: Page, what: string): Promise<void> {
  await expectNoViolations(page, what);
}

test("the filters pane, a filter, a search and the no-results block keep the design checks at four widths in every theme", async () => {
  const testInfo = test.info();
  const { page } = screen;
  const field = page.getByRole("searchbox", { name: SEARCH_LABEL });

  for (const theme of THEMES) {
    await storeSettings(page, { theme });
    await expectRows(page, library.everyone);

    for (const [width, bands] of BANDS_AT_WIDTH) {
      const what = `${theme} at ${width}px`;
      await resize(page, width, bands);
      await checkState(page, `closed pane, ${what}`);
      await openPane(page);
      await checkState(page, `open pane, ${what}`);
      await attachScreenshot(page, testInfo, `pane-${theme}-${width}`);

      await choice(page, "Topic", "Reading").click();
      await choice(page, "Source", "Article").click();
      await expectRows(page, library.articles.slice(0, 2));
      await checkState(page, `a filter chosen, ${what}`);
      await page.getByRole("button", { name: "Clear filters" }).click();

      await field.fill("essay");
      await expectRows(page, library.articles);
      await checkState(page, `a search, ${what}`);
      await attachScreenshot(page, testInfo, `search-${theme}-${width}`);

      await field.fill("qzxjwv");
      await expect(page.getByText("No items match")).toBeVisible();
      await checkState(page, `no results, ${what}`);
      await attachScreenshot(page, testInfo, `no-results-${theme}-${width}`);
      await field.fill("");
    }
  }
});
