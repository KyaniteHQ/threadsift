import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "@playwright/test";

import { SCALE } from "./capture.ts";
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

export async function frame(raws: readonly string[], theme: Theme, out: string): Promise<void> {
  const scratch = mkdtempSync(join(tmpdir(), "threadsift-readme-frame-"));
  const page = join(scratch, "frame.html");
  const png = join(scratch, "frame.png");

  writeFileSync(page, pageOf(raws, theme));
  const browser = await chromium.launch();
  const tab = await browser.newPage({
    viewport: { width: STAGE_WIDTH, height: STAGE_WIDTH },
    deviceScaleFactor: SCALE,
  });

  await tab.goto(pathToFileURL(page).href);
  await tab.evaluate(() => document.fonts.ready);
  await tab.locator("#stage").screenshot({ path: png });
  await browser.close();
  execFileSync("magick", [png, "-strip", "-define", "webp:lossless=true", out]);
  rmSync(scratch, { recursive: true, force: true });
}
