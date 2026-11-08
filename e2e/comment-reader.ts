import { type Page, expect } from "@playwright/test";

import { bar } from "./reader.ts";

export async function visibleButtonText(page: Page): Promise<string> {
  return (await bar(page).locator(".rd-cm span:visible").innerText()).trim();
}

export function crowdedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const strip = document.querySelector(".rd-bar");

    if (strip === null) return ["the reader bar is missing"];

    const crowded: string[] = [];
    const edge = strip.getBoundingClientRect();
    const style = getComputedStyle(strip);
    const left = edge.left + Number(style.paddingLeft.replace("px", ""));
    const right = edge.right - Number(style.paddingRight.replace("px", ""));
    let previous: DOMRect | null = null;

    for (const part of document.querySelectorAll<HTMLElement>(
      ".rd-bar .rd-back, .rd-bar .rd-hint, .rd-bar .rd-cm, .rd-bar .st-gear, .rd-bar .rd-act",
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

const STABLE_READS = 3;
const READ_GAP_MS = 80;

export async function settledButtonText(page: Page): Promise<string> {
  let reads: string[] = [];

  await expect
    .poll(
      async () => {
        reads = [...reads, await visibleButtonText(page)].slice(-STABLE_READS);

        return reads.length === STABLE_READS && reads.every((read) => read === reads[0]);
      },
      { intervals: [READ_GAP_MS] },
    )
    .toBe(true);

  return reads[0] ?? (await visibleButtonText(page));
}
