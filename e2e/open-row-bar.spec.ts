import { type Locator, type Page, expect, test } from "@playwright/test";

import { newCode, newPassword } from "./access.ts";
import { THEMES } from "./design-screens.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { DESKTOP, afterTwoFrames, optionsOf, storeSettings, viewportAt } from "./look.ts";
import { row, seedRows } from "./reader.ts";

const STYLES = optionsOf("style");

const ACCENTS = optionsOf("accent");

const WIDTHS_BESIDE_THE_READER = [760, 1100, 1920] as const;

const BAR_WIDTH = 3;
const CHANNEL_TOLERANCE = 2;

type Rgb = readonly [number, number, number];

interface Edge {
  readonly bar: readonly Rgb[];
  readonly tint: Rgb;
  readonly accent: Rgb;
  readonly softAccent: Rgb;
}

let screen: FreshScreen;
let openId: number;

test.describe.configure({ timeout: 360_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

test.beforeAll(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());

  [openId = 0] = seedRows(screen, [
    { url: "https://example.com/open-row", title: "The open row", author: "A. Writer" },
    { url: "https://example.com/other-row", title: "Another row", author: "B. Writer", read: true },
  ]);
});

test.afterAll(async () => {
  await screen.close();
});

function decodePixels(page: Page, picture: Buffer): Promise<Rgb[]> {
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.codePointAt(0) ?? 0);
    const bitmap = await createImageBitmap(new Blob([bytes]));
    const strip = new OffscreenCanvas(bitmap.width, 1).getContext("2d");

    if (strip === null) {
      throw new Error("no 2d canvas");
    }

    strip.drawImage(bitmap, 0, 0);
    const { data } = strip.getImageData(0, 0, bitmap.width, 1);

    return Array.from({ length: bitmap.width }, (_, x): [number, number, number] => [
      data[x * 4] ?? 0,
      data[x * 4 + 1] ?? 0,
      data[x * 4 + 2] ?? 0,
    ]);
  }, picture.toString("base64"));
}

function resolveColors(page: Page): Promise<{ accent: Rgb; softAccent: Rgb }> {
  return page.evaluate(() => {
    const context = new OffscreenCanvas(1, 1).getContext("2d");

    if (context === null) {
      throw new Error("no 2d canvas");
    }

    const style = getComputedStyle(document.querySelector(".app .it.open") ?? document.body);

    const paint = (property: string): [number, number, number] => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = style.getPropertyValue(property);
      context.fillRect(0, 0, 1, 1);
      const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;

      return [red, green, blue];
    };

    return { accent: paint("--acc"), softAccent: paint("--acc-soft") };
  });
}

async function readEdge(page: Page, open: Locator): Promise<Edge> {
  const box = await open.boundingBox();

  if (box === null) {
    throw new Error("the open row has no box");
  }

  const picture = await page.screenshot({
    clip: { x: box.x, y: box.y + Math.floor(box.height / 2), width: BAR_WIDTH + 1, height: 1 },
  });

  const pixels = await decodePixels(page, picture);

  return {
    bar: pixels.slice(0, BAR_WIDTH),
    tint: pixels[BAR_WIDTH] ?? [-1, -1, -1],
    ...(await resolveColors(page)),
  };
}

function expectNear(actual: Rgb, expected: Rgb, what: string): void {
  for (const [index, channel] of actual.entries()) {
    expect(
      Math.abs(channel - (expected[index] ?? 0)),
      `${what}: rgb(${actual.join(" ")}) against rgb(${expected.join(" ")})`,
    ).toBeLessThanOrEqual(CHANNEL_TOLERANCE);
  }
}

async function expectBar(page: Page, what: string): Promise<void> {
  const open = row(page, openId);
  await expect(open).toHaveClass(/\bopen\b/u);
  await afterTwoFrames(page);
  const edge = await readEdge(page, open);

  for (const pixel of edge.bar) {
    expectNear(pixel, edge.accent, `${what}: bar pixel against the accent`);
  }

  expectNear(edge.tint, edge.softAccent, `${what}: the row beside the bar against its tint`);
}

async function expectBarInEveryState(page: Page, what: string): Promise<void> {
  await page.mouse.move(0, 0);
  await expectBar(page, `${what}, at rest`);

  await row(page, openId).hover();
  await expectBar(page, `${what}, hovered`);

  await page.mouse.move(0, 0);
  await page.keyboard.press("Shift");
  await row(page, openId).locator(".it-open").focus();
  await expect(page.locator(".it:has(.it-open:focus-visible)")).toHaveCount(1);
  await expectBar(page, `${what}, focused`);
}

function drawsBarIn(style: string): void {
  test(`the open row draws its ${BAR_WIDTH}px accent bar on its start edge in the ${style} Style in every theme, at rest, hovered and focused`, async () => {
    const { page } = screen;
    await viewportAt(page, DESKTOP.width);

    for (const theme of THEMES) {
      await storeSettings(page, { style, theme }, `/items/${openId}`);
      await expectBarInEveryState(page, `${style}, ${theme}`);
    }
  });
}

for (const style of STYLES) {
  drawsBarIn(style);
}

test("the open row draws its bar with every accent in every theme", async () => {
  const { page } = screen;
  await viewportAt(page, DESKTOP.width);

  for (const accent of ACCENTS) {
    for (const theme of THEMES) {
      await storeSettings(page, { accent, theme }, `/items/${openId}`);
      await expectBarInEveryState(page, `${accent}, ${theme}`);
    }
  }
});

test("the open row draws its bar at every width where the Reader sits beside the list", async () => {
  const { page } = screen;

  for (const width of WIDTHS_BESIDE_THE_READER) {
    await viewportAt(page, width);
    await storeSettings(page, {}, `/items/${openId}`);
    await expectBarInEveryState(page, `${width}px`);
  }
});
