import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

import { type Rig, SCALE } from "./rig.ts";
import type { Theme } from "./views.ts";

const ROOT = join(import.meta.dirname, "..", "..");

const PNG_WIDTH_AT = 16;

const STAGE_WIDTH = 4000;

function cssWidth(raw: string): number {
  return readFileSync(raw).readUInt32BE(PNG_WIDTH_AT) / SCALE;
}

function pageOf(raws: readonly string[], theme: Theme): string {
  const tokens = pathToFileURL(join(ROOT, "design", "system", "tokens.css")).href;
  const style = pathToFileURL(join(import.meta.dirname, "frame.css")).href;
  const windows = raws
    .map(
      (raw) =>
        `<div class="window"><img src="${pathToFileURL(raw).href}" width="${String(cssWidth(raw))}"></div>`,
    )
    .join("");

  return `<!doctype html><link rel="stylesheet" href="${tokens}"><link rel="stylesheet" href="${style}"><body data-theme="${theme}"><div class="stage" id="stage"><div class="glow a" data-accent="moss"></div><div class="glow b" data-accent="teal"></div>${windows}</div></body>`;
}

export function requireMagick(): void {
  try {
    const formats = execFileSync("magick", ["-list", "format"], { encoding: "utf8" });

    if (!/^\s*WEBP\b/mu.test(formats)) throw new Error("no WebP");
  } catch {
    throw new Error(
      "ImageMagick with WebP support is missing: `magick -list format` must list WEBP. Install ImageMagick and run the tool again.",
    );
  }
}

export async function frame(
  rig: Readonly<Rig>,
  raws: readonly string[],
  theme: Theme,
  out: string,
): Promise<void> {
  const page = join(rig.scratch, `${basename(out)}.html`);
  const png = join(rig.scratch, `${basename(out)}.png`);

  writeFileSync(page, pageOf(raws, theme));
  const context = await rig.newContext({ width: STAGE_WIDTH, height: STAGE_WIDTH, scale: SCALE });

  try {
    const tab = await context.newPage();

    await tab.goto(pathToFileURL(page).href);
    await tab.evaluate(() => document.fonts.ready);
    await tab.locator("#stage").screenshot({ path: png });
  } finally {
    await context.close();
  }
  execFileSync("magick", [png, "-strip", "-define", "webp:lossless=true", out]);
}
