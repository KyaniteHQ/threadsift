import { type Page, expect, test } from "@playwright/test";

import { MARK_READ } from "../web/src/reader-text.ts";
import { newCode, newPassword } from "./access.ts";
import { ESSAY } from "./articles.ts";
import { agentHeaders, sendDigest } from "./catalog.ts";
import { BANDS_AT_WIDTH, THEMES, expectNoViolations, resize } from "./design-screens.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { DESKTOP, attachScreenshot, storeSettings, viewportAt } from "./look.ts";
import { bar, reader, row, seedRows } from "./reader.ts";

const NARROW_WIDTH = 600;

let screen: FreshScreen;
let digestId: number;
let linkOnlyId: number;

test.describe.configure({ timeout: 360_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

test.beforeAll(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());

  const essay = await sendDigest(screen, ESSAY, {
    tags: ["Craft", "Tools"],
    headers: await agentHeaders(screen),
  });

  digestId = essay.id;

  [linkOnlyId = 0] = seedRows(screen, [
    {
      url: "https://example.com/gone",
      title: null,
      source: "other",
      kind: "link",
      fetchResult: "status",
      savedAt: Date.now() + 1000,
    },
  ]);
});

test.afterAll(async () => {
  await screen.close();
});

function breaksNoRule(name: string, which: () => number): void {
  test(`the Reader open on ${name} breaks no design rule in Light, Dark and Sepia at 390, 600, 1440 and 1920 px`, async () => {
    const { page } = screen;
    const info = test.info();

    for (const theme of THEMES) {
      for (const [width, bands] of BANDS_AT_WIDTH) {
        await viewportAt(page, width);
        await storeSettings(page, { theme }, `/items/${which()}`);
        await resize(page, width, bands);
        await expect(reader(page)).toBeVisible();
        await expect(reader(page).locator(".rd-title")).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await expectNoViolations(page, `${name}, ${theme} at ${width}px`);
        await attachScreenshot(page, info, `reader-${name.replaceAll(" ", "-")}-${theme}-${width}`);
      }
    }
  });
}

breaksNoRule("a Digest Item", () => digestId);

breaksNoRule("a Link-only Item", () => linkOnlyId);

test("the controls of the reader bar work from the keyboard and show a focus ring", async () => {
  const { page } = screen;
  await viewportAt(page, DESKTOP.width);
  await storeSettings(page, {}, `/items/${digestId}`);
  const mark = bar(page).getByRole("button", { name: MARK_READ });
  await mark.focus();
  await expect(mark).toBeFocused();
  expect(await mark.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  await mark.press("Enter");
  await expect(row(page, digestId)).not.toHaveClass(/\bunread\b/u);
  await page.keyboard.press("Tab");
  await expect(bar(page).getByRole("link", { name: /^Open article/u })).toBeFocused();
});

test("in forced colours the open row keeps a visible border", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: screen.fresh.url,
    storageState: await screen.context.storageState(),
    forcedColors: "active",
  });

  const page = await context.newPage();
  await viewportAt(page, DESKTOP.width);
  await page.goto(`/items/${digestId}`);
  await expect(reader(page)).toBeVisible();
  const open = row(page, digestId);
  await expect(open).toHaveClass(/\bopen\b/u);

  const border = await open.evaluate((element) => {
    const style = getComputedStyle(element);

    return {
      width: style.borderInlineStartWidth,
      style: style.borderInlineStartStyle,
      color: style.borderInlineStartColor,
    };
  });

  expect(border.style).toBe("solid");
  expect(Number(border.width.replace("px", ""))).toBeGreaterThanOrEqual(3);
  expect(border.color).not.toBe("rgba(0, 0, 0, 0)");
  await context.close();
});

const COUNTER = "view-transitions";

async function countTransitions(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    const original = document.startViewTransition.bind(document);

    document.startViewTransition = (...args: Parameters<typeof original>) => {
      localStorage.setItem(key, String(Number(localStorage.getItem(key) ?? "0") + 1));

      return original(...args);
    };
  }, COUNTER);
}

function transitionsOf(page: Page): Promise<number> {
  return page.evaluate((key) => Number(localStorage.getItem(key) ?? "0"), COUNTER);
}

function transitionsWith(reduced: "reduce" | "no-preference", expected: string): void {
  test(`with prefers-reduced-motion ${reduced}, ${expected}`, async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: screen.fresh.url,
      storageState: await screen.context.storageState(),
      reducedMotion: reduced,
    });

    const page = await context.newPage();
    await countTransitions(page);
    await viewportAt(page, NARROW_WIDTH);
    await page.goto("/");
    await expect(row(page, digestId)).toBeVisible();

    await row(page, digestId).locator("a.it-open").click();
    await expect(reader(page)).toBeVisible();
    await bar(page).getByRole("button", { name: "Back to list" }).click();
    await expect(reader(page)).toHaveCount(0);

    expect(await transitionsOf(page)).toBe(reduced === "reduce" ? 0 : 2);
    await context.close();
  });
}

transitionsWith("reduce", "no view transition runs and the Reader changes at once");

transitionsWith("no-preference", "the view transition runs once for opening and once for closing");
