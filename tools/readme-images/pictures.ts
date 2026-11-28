import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { Rig } from "./rig.ts";

const ROOT = join(import.meta.dirname, "..", "..");

const SIZE = { width: 1200, height: 630 } as const;

const QUALITY = 82;

const CIRCLES = [
  { x: 18, y: 30, r: 34 },
  { x: 72, y: 70, r: 46 },
  { x: 88, y: 18, r: 22 },
];

function pageOf(accent: string, variant: number): string {
  const tokens = pathToFileURL(join(ROOT, "design", "system", "tokens.css")).href;
  const blobs = CIRCLES.map(
    ({ x, y, r }, index) =>
      `<i style="left:${String(x + variant * 3 * (index + 1))}%;top:${String(y)}%;width:${String(r)}%;aspect-ratio:1;opacity:${String(0.28 + index * 0.12)}"></i>`,
  ).join("");

  return `<!doctype html><link rel="stylesheet" href="${tokens}"><style>body{margin:0}.art{position:relative;overflow:hidden;width:${String(SIZE.width)}px;height:${String(SIZE.height)}px;background:linear-gradient(${String(120 + variant * 25)}deg,var(--acc-soft),color-mix(in oklab,var(--acc) 55%,var(--bg)))}i{position:absolute;translate:-50% -50%;border-radius:50%;background:var(--acc)}</style><body data-theme="light"><div class="art" data-accent="${accent}">${blobs}</div>`;
}

export async function picture(
  rig: Readonly<Rig>,
  accent: string,
  variant: number,
): Promise<string> {
  const file = join(rig.scratch, "picture.html");

  writeFileSync(file, pageOf(accent, variant));
  const context = await rig.newContext({ ...SIZE, scale: 1 });

  try {
    const tab = await context.newPage();

    await tab.goto(pathToFileURL(file).href);
    const bytes = await tab.screenshot({ type: "jpeg", quality: QUALITY });

    return `data:image/jpeg;base64,${bytes.toString("base64")}`;
  } finally {
    await context.close();
  }
}
