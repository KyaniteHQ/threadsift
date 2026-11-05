import { type Locator, type Page, type TestInfo, expect, test } from "@playwright/test";

import { SETTINGS } from "../design/system/settings.ts";
import { postLink } from "./api.ts";
import { checkDefaults } from "./default-tokens.ts";
import { collectViolations } from "./design-checks.ts";
import { newRunId } from "./links.ts";
import {
  DEFAULT_FONT,
  HUES,
  type Stored,
  app,
  computed,
  gear,
  openPanel,
  panel,
  storeSettings,
  storedSettings,
} from "./look.ts";

const BANDS_AT_WIDTH = [
  [390, "phone narrow medium wide full"],
  [600, "narrow medium wide full"],
  [1440, "full"],
  [1920, "full"],
] as const;

const THEMES = ["light", "dark", "sepia"] as const;
const FONT_ROW = SETTINGS.find((row) => row.key === "font");

async function resize(page: Page, width: number, bands: string): Promise<void> {
  await page.setViewportSize({ width, height: width < 480 ? 640 : 900 });
  await expect(app(page)).toHaveAttribute("data-bp", bands);
}

async function loadWith(page: Page, url: string, stored: Stored): Promise<void> {
  await storeSettings(page, stored, url);
  await expect(page.locator("article.it").first()).toBeVisible();
}

async function showAlertAndFocusRow(page: Page): Promise<void> {
  await page.getByRole("textbox", { name: "Paste a link to save" }).press("Enter");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.locator(".it.open .it-open").focus();
}

async function expectNoViolations(page: Page, what: string): Promise<void> {
  expect(await page.evaluate(collectViolations, DEFAULT_FONT), what).toEqual([]);
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

async function attach(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await testInfo.attach(name, { body: await page.screenshot(), contentType: "image/png" });
}

test("the page keeps the design checks at four widths in every theme and accent, panel open and closed", async ({
  page,
}, testInfo) => {
  const run = newRunId();
  const seeded = [];
  const paths = ["a".repeat(300), "short", "docs/guide?id=alpha&page=2", "x", "y", "z"];

  for (const path of paths) {
    seeded.push(await postLink(page.request, `https://example.com/${run}/${path}`));
  }

  await postLink(page.request, "https://example.com/");

  for (const theme of THEMES) {
    for (const [accent, hue] of Object.entries(HUES)) {
      await loadWith(page, seeded[0]?.body.url ?? "/", { theme, accent });
      await showAlertAndFocusRow(page);
      await expect(app(page)).toHaveAttribute("data-theme", theme);
      await expect(app(page)).toHaveAttribute("data-accent", accent);

      for (const [width, bands] of BANDS_AT_WIDTH) {
        const what = `${theme}, ${accent} at ${width}px`;
        await resize(page, width, bands);
        expect(await computed(page, ".app", "--ah"), `--ah for ${accent} at ${width}px`).toBe(hue);
        await checkRows(page, what);
        await checkPanel(page, what);

        if (accent === "cobalt") {
          await attach(page, testInfo, `${theme}-${width}`);
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

test("a long link is clamped to two lines in its row title", async ({ page }) => {
  const run = newRunId();

  const long = await postLink(
    page.request,
    `https://example.com/${run}/${"segment-".repeat(40)}end`,
  );

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(long.body.url);
    const title = page.locator(".it.open .it-title");
    await expect(title).toBeVisible();

    const lines = await title.evaluate((element) => ({
      shown:
        element.clientHeight / Number(getComputedStyle(element).lineHeight.replace(/px$/u, "")),
      cut: element.scrollHeight > element.clientHeight,
    }));

    expect(lines.shown, `title lines at ${width}px`).toBeLessThan(2.1);
    expect(lines.cut, `title is cut at ${width}px`).toBe(true);
  }
});

function renderedLines(link: Locator): Promise<string[]> {
  return link.evaluate((element) => {
    const lines = new Map<number, string>();

    for (const node of element.childNodes) {
      const text = node.nodeType === Node.TEXT_NODE ? (node.textContent ?? "") : "";

      for (let offset = 0; offset < text.length; offset += 1) {
        const range = document.createRange();
        range.setStart(node, offset);
        range.setEnd(node, offset + 1);
        const top = Math.round(range.getBoundingClientRect().top);
        lines.set(top, (lines.get(top) ?? "") + text.charAt(offset));
      }
    }

    return [...lines.entries()].toSorted(([a], [b]) => a - b).map(([, line]) => line);
  });
}

function breaksMidPart(lines: readonly string[]): string[] {
  return lines.slice(1).flatMap((line, index) => {
    const before = lines[index] ?? "";

    return /[/-]$/u.test(before) || /^[._\-?&=#]/u.test(line) ? [] : [`${before} | ${line}`];
  });
}

test("a row title breaks between path parts on a phone and holds the reading measure on a wide screen", async ({
  page,
}) => {
  const run = newRunId();
  const path = `${run}/my_home_server_backup_strategy_after_losing_a_disk/and-what-i-would-do-differently-next-time/`;
  const saved = await postLink(page.request, `https://example.com/${path}`);

  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(saved.body.url);
  const link = page.locator(".it.open .it-open");
  await expect(link).toBeVisible();
  await expect(link).toHaveAccessibleName(`example.com/${path} opens in a new tab`);

  const phoneLines = await renderedLines(link);
  expect(phoneLines.length, "title lines at 390px").toBeGreaterThan(1);
  expect(breaksMidPart(phoneLines), "line breaks inside a path part").toEqual([]);

  await page.setViewportSize({ width: 1440, height: 900 });

  const wideLines = await renderedLines(link);
  expect(
    Math.max(...wideLines.map((line) => line.length)),
    "longest title line at 1440px",
  ).toBeLessThanOrEqual(75);
});
