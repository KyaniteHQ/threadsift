import { type Page, expect, test } from "@playwright/test";

import { BACK_LONG, BACK_SHORT } from "../web/src/reader-text.ts";
import { newCode, newPassword } from "./access.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { app, gear, openPanel, optionsOf, panel, storeSettings, viewportAt } from "./look.ts";
import { bar, reader, seedRows } from "./reader.ts";

const VIEWS = [
  {
    name: "List",
    stored: {},
    places: [
      { width: 390, place: "page" },
      { width: 600, place: "page" },
      { width: 1440, place: "pane" },
      { width: 1920, place: "pane" },
    ],
  },
  {
    name: "Grid as Page",
    stored: { layout: "grid", openAs: "page" },
    places: [
      { width: 600, place: "page" },
      { width: 1440, place: "page" },
    ],
  },
  {
    name: "Grid as Sheet",
    stored: { layout: "grid", openAs: "sheet" },
    places: [
      { width: 760, place: "sheet" },
      { width: 1440, place: "sheet" },
    ],
  },
] as const;

const FONTS = optionsOf("font");
const SIZES = optionsOf("size");

let screen: FreshScreen;
let ids: readonly number[];

test.describe.configure({ timeout: 480_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

test.beforeAll(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());

  ids = seedRows(screen, [
    {
      url: "https://www.reddit.com/r/selfhosted/comments/2a4qo6/long/",
      title: "Reddit post",
      source: "reddit",
      kind: "reddit-post",
      author: "someone",
      read: true,
    },
    {
      url: "https://github.com/someone/project",
      title: "GitHub repo",
      source: "github",
      kind: "github-repo",
    },
  ]);
});

test.afterAll(async () => {
  await screen.close();
});

function crowdedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const crowded: string[] = [];
    const strip = document.querySelector(".rd-bar");
    const edge = strip?.getBoundingClientRect();
    const style = strip === null || strip === undefined ? null : getComputedStyle(strip);
    const left = (edge?.left ?? 0) + Number((style?.paddingLeft ?? "0").replace("px", ""));
    const right = (edge?.right ?? 0) - Number((style?.paddingRight ?? "0").replace("px", ""));
    let previous: DOMRect | null = null;

    for (const part of document.querySelectorAll<HTMLElement>(
      ".rd-bar .rd-back, .rd-bar .rd-hint, .rd-bar .st-gear, .rd-bar .rd-act",
    )) {
      const box = part.getBoundingClientRect();

      if (box.width > 0) {
        const name = `${part.className} "${part.textContent}"`;

        if (box.left < left - 0.5 || box.right > right + 0.5)
          crowded.push(`${name} leaves the bar`);

        if (part.scrollWidth > part.clientWidth + 1) crowded.push(`${name} is cut`);

        if (previous !== null && box.left < previous.right - 0.5) crowded.push(`${name} overlaps`);

        previous = box;
      }
    }

    return crowded;
  });
}

function fitsAtEveryFontAndSize(
  view: (typeof VIEWS)[number],
  { width, place }: (typeof VIEWS)[number]["places"][number],
): void {
  test(`${view.name} at ${width}px: no reader bar control overflows or overlaps another, at every Font and Text size`, async () => {
    const { page } = screen;
    await viewportAt(page, width);

    for (const font of FONTS) {
      for (const size of SIZES) {
        for (const id of ids) {
          await storeSettings(page, { ...view.stored, font, size }, `/items/${id}`);
          await expect(reader(page)).toBeVisible();
          await expect(app(page)).toHaveAttribute("data-reader", place);
          await expect(page.locator("dialog.sheet")).toHaveCount(place === "sheet" ? 1 : 0);
          await expect(bar(page).locator(".rd-act").first()).toBeVisible();
          await page.evaluate(() => document.fonts.ready);
          await expect
            .poll(() => crowdedControls(page), { message: `${font} ${size} Item ${id}` })
            .toEqual([]);
        }
      }
    }
  });
}

for (const view of VIEWS) {
  for (const entry of view.places) {
    fitsAtEveryFontAndSize(view, entry);
  }
}

const SWEEP_FROM = 1440;
const SWEEP_TO = 390;
const SWEEP_STEP = 30;
const STABLE_READS = 3;
const READ_GAP_MS = 80;

interface Sample {
  readonly barWidth: number;
  readonly stage: number;
  readonly pane: boolean;
}

async function sampleOf(page: Page): Promise<Sample> {
  const hint = await bar(page).locator(".rd-hint").isVisible();
  const iconsOnly = await bar(page).evaluate((element) => element.classList.contains("icons"));
  const pane = (await bar(page).locator(".rd-back").count()) === 0;
  const barWidth = await bar(page).evaluate((element) => element.clientWidth);

  return { barWidth, stage: hint ? 0 : iconsOnly ? 2 : 1, pane };
}

async function settledSample(page: Page): Promise<Sample> {
  let reads: Sample[] = [];

  await expect
    .poll(
      async () => {
        reads = [...reads, await sampleOf(page)].slice(-STABLE_READS);

        return (
          reads.length === STABLE_READS &&
          reads.every((read) => JSON.stringify(read) === JSON.stringify(reads[0]))
        );
      },
      { intervals: [READ_GAP_MS] },
    )
    .toBe(true);

  return reads[0] ?? (await sampleOf(page));
}

test("as the pane narrows the bar drops the key hint first and the button labels last, and nothing overflows on the way", async () => {
  const { page } = screen;
  const [id = 0] = ids;
  await storeSettings(page, {}, `/items/${id}`);
  const samples: Sample[] = [];

  for (let width = SWEEP_FROM; width >= SWEEP_TO; width -= SWEEP_STEP) {
    await viewportAt(page, width);
    await expect(reader(page)).toBeVisible();
    await expect.poll(() => crowdedControls(page), { message: `${width}px` }).toEqual([]);
    samples.push(await settledSample(page));
  }

  const inPane = samples
    .filter((sample) => sample.pane)
    .toSorted((left, right) => right.barWidth - left.barWidth);

  const stages = inPane.map((sample) => sample.stage);
  expect(stages, "the widest pane keeps the hint").toContain(0);
  expect(stages, "a narrower pane keeps labels without the hint").toContain(1);
  expect(stages, "stages never go back as the pane narrows").toEqual(
    stages.toSorted((left, right) => left - right),
  );
  expect(samples.at(-1)?.stage, "the phone shows icons only").toBe(2);
});

type BackLook = "label" | "short" | "icon";

const BACK_ORDER: readonly BackLook[] = ["label", "short", "icon"];

async function backLook(page: Page): Promise<BackLook> {
  const back = bar(page).locator(".rd-back");

  if (await back.evaluate((element) => element.classList.contains("bare"))) return "icon";

  const shown = (await back.locator("span:visible").innerText()).trim();

  if (shown === BACK_LONG) return "label";

  expect(shown).toBe(BACK_SHORT);

  return "short";
}

const SQUEEZE_FROM = 600;
const SQUEEZE_TO = 252;
const SQUEEZE_STEP = 12;

test("as the page bar is squeezed, Back goes from its label to the word Back to its icon, and nothing overflows on the way", async () => {
  const { page } = screen;
  const [, id = 0] = ids;
  await viewportAt(page, SQUEEZE_FROM);
  await storeSettings(page, {}, `/items/${id}`);
  await expect(reader(page)).toBeVisible();
  const seen: BackLook[] = [];

  for (let width = SQUEEZE_FROM; width >= SQUEEZE_TO; width -= SQUEEZE_STEP) {
    await bar(page).evaluate((element, wanted) => {
      element.style.maxWidth = `${wanted}px`;
    }, width);
    await expect.poll(() => crowdedControls(page), { message: `${width}px` }).toEqual([]);
    seen.push(await backLook(page));
  }

  const ranks = seen.map((look) => BACK_ORDER.indexOf(look));
  expect(ranks, "Back never goes back to a longer form as the bar narrows").toEqual(
    ranks.toSorted((left, right) => left - right),
  );
  expect(new Set(seen), "the bar starts with the label and ends with the icon").toEqual(
    new Set(BACK_ORDER),
  );

  await viewportAt(page, 390);
  await expect.poll(() => backLook(page)).toBe("icon");
  await expect(bar(page).locator(".rd-back")).toHaveAccessibleName(BACK_LONG);
});

function carriesGear(width: number): void {
  test(`at ${width}px the Reader that covers the list carries the settings gear, and it opens the settings panel`, async () => {
    const { page } = screen;
    const [, id = 0] = ids;
    await viewportAt(page, width);
    await storeSettings(page, {}, `/items/${id}`);
    await expect(reader(page)).toBeVisible();
    await expect(reader(page).locator(".rd-title")).toBeFocused();

    await expect(bar(page).locator(".st-gear")).toBeVisible();
    const dialog = await openPanel(page);
    await expect(dialog).toBeVisible();
    await expect(gear(page)).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await expect(gear(page)).toBeFocused();
    await expect(reader(page)).toBeVisible();
  });
}

for (const width of [390, 600]) {
  carriesGear(width);
}

test("the wide pane's bar has no settings gear, because the masthead's is beside it", async () => {
  const { page } = screen;
  const [, id = 0] = ids;
  await viewportAt(page, 1440);
  await storeSettings(page, {}, `/items/${id}`);
  await expect(reader(page)).toBeVisible();

  await expect(bar(page).locator(".st-gear")).toHaveCount(0);
});
