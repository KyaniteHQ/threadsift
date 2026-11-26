import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { chromium } from "@playwright/test";
import { z } from "zod";

const root = resolve(import.meta.dirname, "..");
const SOURCE_FILE = "design/system/icon.svg";
const SIDE = 64;
const MASKABLE_SIZE = 512;
const SAFE_RADIUS = 0.4 * SIDE - SIDE / MASKABLE_SIZE;
const CENTRE = SIDE / 2;

type Fit = "tile" | "full-bleed" | "maskable";

const OUTPUTS: readonly { file: string; size: number; fit: Fit }[] = [
  { file: "web/public/icon-32.png", size: 32, fit: "tile" },
  { file: "web/public/icon-192.png", size: 192, fit: "tile" },
  { file: "web/public/icon-512.png", size: 512, fit: "tile" },
  { file: "web/public/icon-maskable-512.png", size: MASKABLE_SIZE, fit: "maskable" },
  { file: "web/public/apple-touch-icon.png", size: 180, fit: "full-bleed" },
  { file: "extension/public/icon/16.png", size: 16, fit: "tile" },
  { file: "extension/public/icon/32.png", size: 32, fit: "tile" },
  { file: "extension/public/icon/48.png", size: 48, fit: "tile" },
  { file: "extension/public/icon/128.png", size: 128, fit: "tile" },
];

const BoxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

interface Colours {
  readonly ground: string;
  readonly mark: string;
}

function replacedOnce(text: string, pattern: string, replacement: string): string {
  const count = text.match(new RegExp(pattern, "gu"))?.length ?? 0;

  if (count !== 1) {
    throw new Error(`${SOURCE_FILE} holds ${String(count)} of ${pattern}, not 1`);
  }

  return text.replace(new RegExp(pattern, "u"), replacement);
}

function hexOf(colour: string): string {
  const context = new OffscreenCanvas(1, 1).getContext("2d");

  if (context === null) throw new Error("The browser gave no 2D context");

  context.fillStyle = colour;
  context.fillRect(0, 0, 1, 1);
  const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;

  return `#${[red, green, blue].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

function themedPage(source: string): string {
  const tokens = readFileSync(resolve(root, "design/system/tokens.css"), "utf8");

  return `<!doctype html><style>${tokens}
.ground { fill: var(--acc); } .mark { fill: var(--on-acc); }</style>
<div class="app" data-theme="light" data-accent="moss">${source}</div>`;
}

function farthestCorner([x, y, width, height]: readonly number[]): number {
  const xs = [x ?? 0, (x ?? 0) + (width ?? 0)];
  const ys = [y ?? 0, (y ?? 0) + (height ?? 0)];

  return Math.max(
    ...xs.flatMap((left) => ys.map((top) => Math.hypot(left - CENTRE, top - CENTRE))),
  );
}

function iconSvg(source: string, colours: Colours, fit: Fit, markScale: number): string {
  const filled = replacedOnce(
    replacedOnce(source, 'class="ground"', `fill="${colours.ground}"`),
    'class="mark"',
    `fill="${colours.mark}"`,
  );

  if (fit === "tile") return filled;

  const fullBleed = replacedOnce(filled, ' rx="[^"]*"', "");

  if (fit === "full-bleed") return fullBleed;

  return replacedOnce(
    fullBleed,
    `fill="${colours.mark}"`,
    `fill="${colours.mark}" transform="translate(${String(CENTRE)} ${String(CENTRE)}) scale(${markScale.toFixed(4)}) translate(-${String(CENTRE)} -${String(CENTRE)})"`,
  );
}

function outputPath(file: string): string {
  const path = resolve(root, file);
  mkdirSync(dirname(path), { recursive: true });
  process.stdout.write(`${file}\n`);

  return path;
}

const source = readFileSync(resolve(root, SOURCE_FILE), "utf8");
const browser = await chromium.launch();

try {
  const page = await browser.newPage();
  await page.setContent(themedPage(source));

  const colours: Colours = {
    ground: await page.evaluate(
      hexOf,
      await page.locator(".ground").evaluate((element) => getComputedStyle(element).fill),
    ),
    mark: await page.evaluate(
      hexOf,
      await page.locator(".mark").evaluate((element) => getComputedStyle(element).fill),
    ),
  };

  const box = BoxSchema.parse(
    await page.locator(".mark").evaluate((element) => {
      if (!(element instanceof SVGGraphicsElement)) throw new TypeError("The mark is not SVG");

      const { x, y, width, height } = element.getBBox();

      return [x, y, width, height];
    }),
  );

  const markScale = SAFE_RADIUS / farthestCorner(box);
  writeFileSync(outputPath("web/public/icon.svg"), iconSvg(source, colours, "tile", markScale));

  await Promise.all(
    OUTPUTS.map(async ({ file, size, fit }) => {
      const icon = await browser.newPage({ viewport: { width: size, height: size } });
      const svg = iconSvg(source, colours, fit, markScale);
      await icon.setContent(
        `<!doctype html><body style="margin: 0">${svg.replace("<svg ", `<svg width="${String(size)}" height="${String(size)}" `)}</body>`,
      );
      writeFileSync(
        outputPath(file),
        await icon.screenshot({
          clip: { x: 0, y: 0, width: size, height: size },
          omitBackground: true,
        }),
      );
    }),
  );
} finally {
  await browser.close();
}
