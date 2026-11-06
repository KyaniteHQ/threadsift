import { type Page, expect, test } from "@playwright/test";

import { SETTINGS } from "../design/system/settings.ts";
import { postLink } from "./api.ts";
import { checkDefaults } from "./default-tokens.ts";
import { BANDS_AT_WIDTH, THEMES, expectNoViolations, resize } from "./design-screens.ts";
import { newRunId, pasteField } from "./links.ts";
import {
  HUES,
  type Stored,
  app,
  attachScreenshot,
  computed,
  gear,
  openPanel,
  panel,
  storeSettings,
  storedSettings,
} from "./look.ts";

const FONT_ROW = SETTINGS.find((row) => row.key === "font");

async function loadWith(page: Page, url: string, stored: Stored): Promise<void> {
  await storeSettings(page, stored, url);
  await expect(page.locator("article.it").first()).toBeVisible();
}

async function showAlertAndFocusRow(page: Page): Promise<void> {
  await pasteField(page).press("Enter");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.locator(".it.open .it-open").focus();
}

async function checkRows(page: Page, what: string): Promise<void> {
  for (const row of [".it.open", "article.it:not(.open)"]) {
    await page.locator(`${row} .it-open`).first().focus();
    await expect(page.locator(".it:has(.it-open:focus-visible)")).toHaveCount(1);
    await expectNoViolations(page, `${row} focused, ${what}`);
  }
}

async function checkPanel(page: Page, what: string): Promise<void> {
  const dialog = await openPanel(page);
  await expectNoViolations(page, `panel open, first choice focused, ${what}`);

  const controls = [
    dialog.getByRole("combobox", { name: "Font" }),
    dialog.getByRole("radio", { name: "Dark" }),
    dialog.getByRole("radio", { name: "Moss" }),
    dialog.getByRole("button", { name: "Reset look" }),
    gear(page),
  ];

  const isSheet = await dialog.evaluate((element) => element.matches(":modal"));

  for (const control of isSheet ? controls.slice(0, -1) : controls) {
    await page.keyboard.press("Shift");
    await control.focus();
    await expect(page.locator(".st-pop :focus-visible, .st-gear:focus-visible")).toHaveCount(1);
    await expectNoViolations(page, `panel open, a control focused, ${what}`);
  }

  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
}

test("the page keeps the design checks at four widths in every theme and accent, panel open and closed", async ({
  page,
}, testInfo) => {
  const run = newRunId();
  const seedUrl = (path: string) => `https://example.com/${run}/${path}`;

  const [first] = await Promise.all([
    postLink(page.request, seedUrl("a".repeat(300))),
    ...["short", "docs/guide?id=alpha&page=2", "x", "y", "z"].map((path) =>
      postLink(page.request, seedUrl(path)),
    ),
    postLink(page.request, "https://example.com/"),
  ]);

  for (const theme of THEMES) {
    for (const [accent, hue] of Object.entries(HUES)) {
      await loadWith(page, first.body.url, { theme, accent });
      await showAlertAndFocusRow(page);
      await expect(app(page)).toHaveAttribute("data-theme", theme);
      await expect(app(page)).toHaveAttribute("data-accent", accent);

      for (const [width, bands] of BANDS_AT_WIDTH) {
        const what = `${theme}, ${accent} at ${width}px`;
        await resize(page, width, bands);
        expect(await computed(app(page), "--ah"), `--ah for ${accent} at ${width}px`).toBe(hue);
        await checkRows(page, what);
        await checkPanel(page, what);

        if (accent === "cobalt") {
          await attachScreenshot(page, testInfo, `${theme}-${width}`);
        }
      }
    }
  }
});

test("no text is under 12px at Small text size and Compact density in any Font, and the panel keeps its font", async ({
  page,
}) => {
  await postLink(page.request, "https://example.com/");

  for (const option of FONT_ROW?.options ?? []) {
    await loadWith(page, "/", { font: option.id, size: "small", density: "compact" });
    await expect(app(page)).toHaveAttribute("data-font", option.id);
    await expect(app(page)).toHaveAttribute("data-size", "small");
    await expect(app(page)).toHaveAttribute("data-density", "compact");

    for (const [width, bands] of [BANDS_AT_WIDTH[0], BANDS_AT_WIDTH[2]]) {
      const what = `${option.id} font, Small and Compact at ${width}px`;
      await resize(page, width, bands);
      await expectNoViolations(page, what);
      await checkPanel(page, what);
    }
  }
});

test("the default option of every setting draws the tokens of an element with no attribute", async ({
  page,
}) => {
  await page.goto("/");
  await expect(app(page)).toBeVisible();

  const result = await page.evaluate(
    checkDefaults,
    SETTINGS.map((row) => ({
      attribute: row.attribute,
      default: row.default,
      options: row.options.map((option) => option.id),
    })),
  );

  expect(result.violations).toEqual([]);
  expect(result.changingTokens.toSorted(), "the settings whose options change tokens").toEqual(
    SETTINGS.filter((row) => row.options.length > 1 && row.key !== "openAs")
      .map((row) => row.attribute)
      .toSorted(),
  );
  expect(await storedSettings(page), "the check stores nothing").toBeNull();
});
