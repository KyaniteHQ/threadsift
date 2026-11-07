import { type Page, expect, test } from "@playwright/test";

import { SETTINGS } from "../design/system/settings-table.ts";
import { newCode, newPassword } from "./access.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { storeSettings, viewportAt } from "./look.ts";
import { bar, reader, seedRows } from "./reader.ts";

const WIDTHS = [390, 600, 1440, 1920] as const;

function optionsOf(key: string): readonly string[] {
  const row = SETTINGS.find((setting) => setting.key === key);

  return row === undefined ? [] : row.options.map((option) => option.id);
}

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
      ".rd-bar .rd-back, .rd-bar .rd-hint, .rd-bar .rd-act",
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

function fitsAtEveryFontAndSize(width: number): void {
  test(`at ${width}px no reader bar control overflows or overlaps another, at every Font and Text size`, async () => {
    const { page } = screen;
    await viewportAt(page, width);
    let checked = 0;

    for (const font of FONTS) {
      for (const size of SIZES) {
        for (const id of ids) {
          await storeSettings(page, { font, size }, `/items/${id}`);
          await expect(reader(page)).toBeVisible();
          await expect(bar(page).locator(".rd-act").first()).toBeVisible();
          await page.evaluate(() => document.fonts.ready);
          await expect
            .poll(() => crowdedControls(page), { message: `${font} ${size} Item ${id}` })
            .toEqual([]);
          checked += 1;
        }
      }
    }

    expect(checked).toBe(FONTS.length * SIZES.length * ids.length);
  });
}

for (const width of WIDTHS) {
  fitsAtEveryFontAndSize(width);
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
    .poll(async () => {
      reads = [...reads, await sampleOf(page)].slice(-STABLE_READS);
      await page.waitForTimeout(READ_GAP_MS);

      return (
        reads.length === STABLE_READS &&
        reads.every((read) => JSON.stringify(read) === JSON.stringify(reads[0]))
      );
    })
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
