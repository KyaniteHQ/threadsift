import { type Page, type TestInfo, expect } from "@playwright/test";

import { DEFAULTS } from "../design/system/settings.ts";
import { postLink } from "./api.ts";
import { collectDesign } from "./design-checks.ts";
import { BANDS_AT_WIDTH, THEMES, expectNoViolations, resize } from "./design-screens.ts";
import { loadFamilies, watchRequests } from "./fonts.ts";
import { newRunId } from "./links.ts";
import { app, attachScreenshot, computed, openPanel, panel, storeSettings } from "./look.ts";

async function checkFaces(page: Page): Promise<void> {
  for (const { family, loaded } of await loadFamilies(page)) {
    expect(loaded, `a registered face loaded for ${family}`).toBe(true);
  }
}

async function expectStyleControls(page: Page): Promise<void> {
  const dialog = panel(page);
  await expect(dialog.getByRole("combobox", { name: "Font" })).toBeDisabled();
  await expect(dialog.getByRole("combobox", { name: "Font" })).toHaveAccessibleDescription(
    "Set by the style",
  );
  await expect(dialog.getByRole("radiogroup", { name: "Accent" })).toHaveAccessibleDescription(
    "Set by the style",
  );

  for (const radio of await dialog
    .getByRole("radiogroup", { name: "Accent" })
    .getByRole("radio")
    .all()) {
    await expect(radio).toBeDisabled();
  }
}

async function checkTheme(page: Page, style: string, theme: string, info: TestInfo): Promise<void> {
  const { contrast: measurements } = await page.evaluate(collectDesign, DEFAULTS.font);
  await info.attach(`${theme}-contrast`, {
    body: JSON.stringify(measurements, null, 2),
    contentType: "application/json",
  });

  for (const pair of measurements) {
    expect(pair.ratio, `${theme}: ${pair.fg} on ${pair.bg}`).toBeGreaterThanOrEqual(pair.minimum);
  }

  await expect(page.locator("html")).toHaveAttribute("data-style", style);
  await expect(page.locator("html")).toHaveCSS(
    "background-color",
    await computed(app(page), "background-color"),
  );
  await checkFaces(page);
  const radius = await computed(app(page), "--r3");

  for (const [width, bands] of BANDS_AT_WIDTH) {
    await resize(page, width, bands);
    const what = `${style}, ${theme}, ${width}px`;
    await page.locator(".it.open .it-open").focus();
    await expectNoViolations(page, what);

    if (theme === "light" && width === 1440) {
      await attachScreenshot(page, info, `${style}-list`);
    }

    const dialog = await openPanel(page);
    await expectNoViolations(page, `panel open, ${what}`);
    expect(await computed(dialog, "--acc")).toBe(await computed(app(page), "--acc"));
    await expect(dialog).toHaveCSS("border-top-left-radius", radius);

    if (theme === "light" && width === 1440) {
      await expectStyleControls(page);
      await attachScreenshot(page, info, `${style}-panel`);
    }

    await page.keyboard.press("Escape");
    await expect(panel(page)).toBeHidden();
  }
}

export async function checkStyle(page: Page, info: TestInfo, style: string): Promise<void> {
  const { origins, fontFiles } = watchRequests(page);

  const [, first] = await Promise.all([
    postLink(page.request, `https://example.com/${newRunId()}/style`),
    postLink(page.request, "https://example.com/"),
  ]);

  for (const theme of THEMES) {
    await storeSettings(
      page,
      {
        style,
        theme,
        font: "mono",
        accent: "iris",
        size: "small",
        width: "wide",
        density: "compact",
        tags: "chips",
        comments: "cards",
        images: "off",
      },
      first.body.url,
    );
    await expect(page.locator(".it.open")).toBeVisible();
    await expect(app(page)).toHaveAttribute("data-style", style);
    await checkTheme(page, style, theme, info);
  }

  expect([...origins], "every request stays on the app origin").toEqual([
    new URL(page.url()).origin,
  ]);
  expect(fontFiles.length, "the browser requested real font files").toBeGreaterThan(0);
  expect(
    fontFiles.every((font) => font.status === 200),
    "font files loaded",
  ).toBe(true);
  await info.attach("font-requests", {
    body: JSON.stringify(fontFiles, null, 2),
    contentType: "application/json",
  });
}
