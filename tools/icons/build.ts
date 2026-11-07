/* oxlint-disable max-lines-per-function, unicorn/consistent-function-scoping, typescript/prefer-readonly-parameter-types -- page.evaluate serialises this one function, so its helpers and DOM parameters must sit inside it */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";
import { z } from "zod";

const root = resolve(import.meta.dirname, "../..");
const publicDir = resolve(root, "web/public");
const manifestFile = resolve(publicDir, "manifest.webmanifest");
const pageFile = resolve(root, "web/index.html");

const FONT_FILE =
  "node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2";

const GLYPH = "T";
const CAP_HEIGHT_SHARE = 0.5;
const SAFE_RADIUS_SHARE = 0.4;
const CORNER_SHARE = 0.22;

const ICONS = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "icon-maskable-512.png", size: 512, maskable: true },
] as const;

const DrawnSchema = z.object({
  icons: z.array(z.object({ file: z.string(), data: z.string(), farthest: z.number() })),
  light: z.string(),
  dark: z.string(),
});

function replacedOnce(text: string, pattern: RegExp, replacement: string, file: string): string {
  if (!pattern.test(text)) {
    throw new Error(`${file} has no match for ${pattern.source}`);
  }

  return text.replace(pattern, replacement);
}

function writeThemeColours(light: string, dark: string): void {
  const manifest = [/("theme_color": ")[^"]*(")/u, /("background_color": ")[^"]*(")/u].reduce(
    (text, pattern) => replacedOnce(text, pattern, `$1${light}$2`, manifestFile),
    readFileSync(manifestFile, "utf8"),
  );

  const page = [
    [/(content=")[^"]*(" media="\(prefers-color-scheme: light\)")/u, light],
    [/(content=")[^"]*(" media="\(prefers-color-scheme: dark\)")/u, dark],
  ].reduce(
    (text, [pattern, colour]) =>
      pattern instanceof RegExp && colour !== undefined
        ? replacedOnce(text, pattern, `$1${colour}$2`, pageFile)
        : text,
    readFileSync(pageFile, "utf8"),
  );

  writeFileSync(manifestFile, manifest);
  writeFileSync(pageFile, page);
}

function pageHtml(): string {
  const tokens = readFileSync(resolve(root, "design/system/tokens.css"), "utf8");
  const font = readFileSync(resolve(root, FONT_FILE)).toString("base64");

  return `<!doctype html><style>
@font-face { font-family: 'IBM Plex Sans'; font-weight: 600; src: url(data:font/woff2;base64,${font}) format('woff2'); }
${tokens}
</style>
<div id="brand" class="app" data-theme="light" style="background: var(--acc); color: var(--on-acc); font-family: var(--f-display); font-weight: var(--dw)"></div>
<div id="light" class="app" data-theme="light" style="background: var(--bg)"></div>
<div id="dark" class="app" data-theme="dark" style="background: var(--bg)"></div>`;
}

const draw = async (
  parameters: Readonly<{
    icons: readonly { file: string; size: number; maskable: boolean }[];
    glyph: string;
    capShare: number;
    cornerShare: number;
  }>,
) => {
  const styleOf = (id: string) => {
    const element = document.querySelector(`#${id}`);

    if (element === null) {
      throw new Error(`The icon page has no #${id}`);
    }

    return getComputedStyle(element);
  };

  const contextOf = (canvas: OffscreenCanvas) => {
    const context = canvas.getContext("2d");

    if (context === null) {
      throw new Error("The browser gave no 2D context");
    }

    return context;
  };

  const brand = styleOf("brand");
  const font = `${brand.fontWeight} FONT_SIZEpx ${brand.fontFamily}`;
  await document.fonts.load(font.replace("FONT_SIZE", "100"));

  const hexOf = (color: string): string => {
    const context = contextOf(new OffscreenCanvas(1, 1));
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;

    return `#${[red, green, blue].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
  };

  const dataOf = async (canvas: OffscreenCanvas): Promise<string> => {
    const bytes = new Uint8Array(
      await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer(),
    );

    return btoa(bytes.reduce((text, byte) => text + String.fromCodePoint(byte), ""));
  };

  const drawn = parameters.icons.map(({ file, size, maskable }) => {
    const canvas = new OffscreenCanvas(size, size);
    const context = contextOf(canvas);
    context.fillStyle = brand.backgroundColor;
    context.beginPath();
    context.roundRect(0, 0, size, size, maskable ? 0 : size * parameters.cornerShare);
    context.fill();

    context.font = font.replace("FONT_SIZE", "100");
    const probe = context.measureText(parameters.glyph);
    const fontSize = (100 * parameters.capShare * size) / probe.actualBoundingBoxAscent;
    context.font = font.replace("FONT_SIZE", String(fontSize));
    const box = context.measureText(parameters.glyph);
    const width = box.actualBoundingBoxLeft + box.actualBoundingBoxRight;
    const left = (size - width) / 2;
    const baseline = (size + box.actualBoundingBoxAscent - box.actualBoundingBoxDescent) / 2;
    context.fillStyle = brand.color;
    context.fillText(parameters.glyph, left + box.actualBoundingBoxLeft, baseline);

    const xs = [left, left + width];
    const ys = [baseline - box.actualBoundingBoxAscent, baseline + box.actualBoundingBoxDescent];

    const farthest = Math.max(
      ...xs.flatMap((x) => ys.map((y) => Math.hypot(x - size / 2, y - size / 2) / size)),
    );

    return { file, canvas, farthest };
  });

  const icons = await Promise.all(
    drawn.map(async ({ file, canvas, farthest }) => ({
      file,
      data: await dataOf(canvas),
      farthest,
    })),
  );

  return {
    icons,
    light: hexOf(styleOf("light").backgroundColor),
    dark: hexOf(styleOf("dark").backgroundColor),
  };
};

const browser = await chromium.launch();

try {
  const page = await browser.newPage();
  await page.setContent(pageHtml());

  const drawn = DrawnSchema.parse(
    await page.evaluate(draw, {
      icons: ICONS,
      glyph: GLYPH,
      capShare: CAP_HEIGHT_SHARE,
      cornerShare: CORNER_SHARE,
    }),
  );

  for (const { file, data, farthest } of drawn.icons) {
    if (farthest > SAFE_RADIUS_SHARE) {
      throw new Error(`${file}: the glyph reaches ${farthest} of the width from the centre`);
    }

    writeFileSync(resolve(publicDir, file), Buffer.from(data, "base64"));
    console.log(`${file} written, glyph reaches ${farthest.toFixed(3)} of the width`);
  }

  writeThemeColours(drawn.light, drawn.dark);
  console.log(`theme colours written: light ${drawn.light}, dark ${drawn.dark}`);
} finally {
  await browser.close();
}
