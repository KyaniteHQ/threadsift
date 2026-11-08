import { type Page, expect, test } from "@playwright/test";

import { NO_POST_TEXT } from "../web/src/reader-text.ts";
import { newCode, newPassword } from "./access.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { afterTwoFrames, gear, openPanel, panel, storeSettings, viewportAt } from "./look.ts";
import { bar, reader, seedRows } from "./reader.ts";

const PAGE_WIDTH = 600;
const SQUEEZE_FROM = 480;
const SQUEEZE_TO = 300;
const SQUEEZE_STEP = 4;
const STABLE_READS = 3;
const READ_GAP_MS = 40;
const FONT_FILES = /\.woff2?$/u;
const POST_TEXT_CODE = /\/assets\/PostText-[^/]+\.js$/u;

let screen: FreshScreen;
let itemPath: string;

test.describe.configure({ timeout: 120_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());

  const [id = 0] = seedRows(screen, [
    {
      url: "https://github.com/someone/project",
      title: "GitHub repo",
      source: "github",
      kind: "github-repo",
    },
  ]);

  itemPath = `/items/${id}`;
});

test.afterEach(async () => {
  await screen.close();
});

async function holdResponses(page: Page, files: RegExp): Promise<() => void> {
  const { promise, resolve } = Promise.withResolvers<void>();

  await page.route(files, async (route) => {
    await promise;
    await route.continue();
  });

  return resolve;
}

function fitOf(page: Page): Promise<string> {
  return bar(page).evaluate((element) => {
    const back = element.querySelector(".rd-back");
    const shown = back?.querySelector("span:not([hidden])")?.textContent?.trim() ?? "";
    const labels = element.classList.contains("icons") ? "icons" : "labels";

    return `${labels} ${back?.classList.contains("bare") === true ? "icon" : shown}`;
  });
}

async function settledFit(page: Page): Promise<string> {
  let reads: string[] = [];

  await expect
    .poll(
      async () => {
        reads = [...reads, await fitOf(page)].slice(-STABLE_READS);

        return reads.length === STABLE_READS && new Set(reads).size === 1;
      },
      { intervals: [READ_GAP_MS] },
    )
    .toBe(true);

  return reads[0] ?? "";
}

function squeezeTo(page: Page, width: number): Promise<void> {
  return bar(page).evaluate((element, wanted) => {
    element.style.maxWidth = `${wanted}px`;
  }, width);
}

async function fitsAtEachWidth(page: Page): Promise<ReadonlyMap<number, string>> {
  const fits = new Map<number, string>();

  for (let width = SQUEEZE_FROM; width >= SQUEEZE_TO; width -= SQUEEZE_STEP) {
    await squeezeTo(page, width);
    fits.set(width, await settledFit(page));
  }

  return fits;
}

async function openHeld(page: Page, files: RegExp): Promise<() => void> {
  const release = await holdResponses(page, files);
  await viewportAt(page, PAGE_WIDTH);
  await page.goto(itemPath, { waitUntil: "domcontentloaded" });
  await expect(reader(page)).toBeVisible();

  return release;
}

test("a web font that arrives after the first fit refits the bar at a width where its metrics change the fit", async () => {
  const { page } = screen;
  const release = await openHeld(page, FONT_FILES);
  const fallback = await fitsAtEachWidth(page);
  release();
  await page.evaluate(() => document.fonts.ready);
  const loaded = await fitsAtEachWidth(page);
  await page.unrouteAll({ behavior: "wait" });

  const differing = [...fallback].find(([width, fit]) => loaded.get(width) !== fit);
  expect(
    differing,
    "a width where the fallback font and the web font need different fits",
  ).toBeDefined();
  const [width = 0, fallbackFit = ""] = differing ?? [];

  const lateRelease = await openHeld(page, FONT_FILES);
  await squeezeTo(page, width);
  expect(await settledFit(page), "the fit with the fallback font").toBe(fallbackFit);
  lateRelease();
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => fitOf(page), { message: `${width}px` }).toBe(loaded.get(width));
});

test("the settings gear keeps its focus when the post text code arrives after Settings has closed", async () => {
  const { page } = screen;
  const release = await holdResponses(page, POST_TEXT_CODE);
  await viewportAt(page, PAGE_WIDTH);
  await storeSettings(page, {}, itemPath);
  await expect(reader(page)).toBeVisible();

  await openPanel(page);
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await expect(gear(page)).toBeFocused();

  release();
  await expect(reader(page).getByText(NO_POST_TEXT)).toBeVisible();
  await afterTwoFrames(page);
  await expect(gear(page)).toBeFocused();
});
