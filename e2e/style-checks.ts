import { type Page, type TestInfo, expect } from "@playwright/test";

import { DEFAULTS } from "../design/system/settings.ts";
import { postLink, postPage } from "./api.ts";
import { collectDesign } from "./design-checks.ts";
import {
  BANDS_AT_WIDTH,
  THEMES,
  expectNoViolations,
  expectTokenContrast,
  resize,
} from "./design-screens.ts";
import { loadFamilies, watchRequests } from "./fonts.ts";
import { newRunId } from "./links.ts";
import { app, attachScreenshot, computed, openPanel, panel, storeSettings } from "./look.ts";
import { paragraphs, reader } from "./reader.ts";

const POST_TEXT = "paragraph 1 holds a few ordinary sentences";

const PARAGRAPHS = 6;

export type StyleExpectation = Readonly<{
  id: string;
  display: string;
  body: string;
  radius: string;
}>;

function firstFamily(value: string): string {
  return (value.split(",")[0] ?? "").trim().replaceAll(/^["']|["']$/gu, "");
}

async function expectStyleTokens(
  page: Page,
  style: StyleExpectation,
  theme: string,
): Promise<void> {
  expect(firstFamily(await computed(app(page), "--f-display")), `${style.id} display face`).toBe(
    style.display,
  );
  expect(firstFamily(await computed(app(page), "--f-read")), `${style.id} body face`).toBe(
    style.body,
  );
  await expect(page.locator(".it.open .it-title .it-open")).toHaveCSS(
    "font-family",
    new RegExp(style.display, "u"),
  );

  const cascade = await page.evaluate(
    ({ id, theme: paletteTheme }) => {
      const root = document.querySelector(".app") ?? document.body;
      const probe = document.createElement("div");
      probe.dataset["style"] = id;
      probe.dataset["theme"] = paletteTheme;
      probe.dataset["font"] = "plex";
      probe.dataset["accent"] = "cobalt";
      root.append(probe);
      const properties = ["--f-display", "--f-ui", "--f-read", "--f-mono", "--acc"];
      const rootStyle = getComputedStyle(root);
      const probeStyle = getComputedStyle(probe);

      const result = properties.map((property) => ({
        property,
        root: rootStyle.getPropertyValue(property),
        probe: probeStyle.getPropertyValue(property),
      }));

      probe.remove();

      return result;
    },
    { id: style.id, theme },
  );

  for (const value of cascade) {
    expect(
      value.root,
      `${style.id}: stored Font and Accent do not override ${value.property}`,
    ).toBe(value.probe);
  }
}

async function checkFaces(page: Page): Promise<void> {
  for (const { family, loaded } of await loadFamilies(page)) {
    expect(loaded, `a registered face loaded for ${family}`).toBe(true);
  }
}

async function checkTheme(
  page: Page,
  style: StyleExpectation,
  theme: string,
  info: TestInfo,
): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-style", style.id);
  await expect(page.locator("html")).toHaveCSS(
    "background-color",
    await computed(app(page), "background-color"),
  );
  await checkFaces(page);
  await expectStyleTokens(page, style, theme);

  for (const [width, bands] of BANDS_AT_WIDTH) {
    await resize(page, width, bands);
    const what = `${style.id}, ${theme}, ${width}px`;
    await page.locator(".it.open .it-open").focus();
    const measured = await page.evaluate(collectDesign, DEFAULTS.font);
    expect(measured.violations, what).toEqual([]);

    if (width === BANDS_AT_WIDTH[0][0]) {
      await info.attach(`${theme}-contrast`, {
        body: JSON.stringify(measured.contrast, null, 2),
        contentType: "application/json",
      });

      expectTokenContrast(measured.contrast, `${style.id} ${theme}`);
    }

    if (theme === "light" && width === 1440) {
      await attachScreenshot(page, info, `${style.id}-list`);
    }

    const dialog = await openPanel(page);
    await expectNoViolations(page, `panel open, ${what}`);
    expect(await computed(dialog, "--acc")).toBe(await computed(app(page), "--acc"));
    await expect(dialog).toHaveCSS("border-top-left-radius", style.radius);

    if (theme === "light" && width === 1440) {
      await attachScreenshot(page, info, `${style.id}-panel`);
    }

    await page.keyboard.press("Escape");
    await expect(panel(page)).toBeHidden();
  }
}

async function postStyleItems(page: Page): Promise<string> {
  const run = newRunId();

  const [, article] = await Promise.all([
    postLink(page.request, `https://example.com/${run}/style`),
    postPage(page.request, `https://style-${run}.invalid/article`, {
      title: `Style ${run}`,
      markdown: paragraphs(PARAGRAPHS, "Style"),
    }),
  ]);

  return article.body.url;
}

export async function checkStyle(
  page: Page,
  info: TestInfo,
  style: StyleExpectation,
): Promise<void> {
  const { origins, fontFiles } = watchRequests(page);

  const address = await postStyleItems(page);

  for (const theme of THEMES) {
    await storeSettings(
      page,
      {
        style: style.id,
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
      address,
    );
    await expect(page.locator(".it.open")).toBeVisible();
    await expect(reader(page).locator(".md")).toContainText(POST_TEXT);
    await expect(app(page)).toHaveAttribute("data-style", style.id);
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
