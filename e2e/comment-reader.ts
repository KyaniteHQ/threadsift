import { type Page, expect } from "@playwright/test";

import type { FreshScreen } from "./fresh-screen.ts";
import { fontsLoaded, storeSettings, viewportAt } from "./look.ts";
import { bar, crowdedControls, reader } from "./reader.ts";

export async function openItem(
  screen: FreshScreen,
  width: number,
  id: number,
  stored = {},
): Promise<Page> {
  const { page } = screen;
  await viewportAt(page, width);
  await storeSettings(page, stored, `/items/${id}`);
  await expect(reader(page)).toBeVisible();
  await fontsLoaded(page);

  return page;
}

export function comments(page: Page) {
  return page.locator(".rd-comments");
}

export async function visibleButtonText(page: Page): Promise<string> {
  return (await bar(page).locator(".rd-cm span:visible").innerText()).trim();
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

export async function sweepBar(
  page: Page,
  { from, to, step }: Readonly<{ from: number; to: number; step: number }>,
): Promise<string[]> {
  const seen: string[] = [];

  for (let width = from; width >= to; width -= step) {
    await viewportAt(page, width);
    await fontsLoaded(page);
    await expect.poll(() => crowdedControls(page), { message: `${width}px` }).toEqual([]);
    seen.push(await settledButtonText(page));
  }

  return seen;
}

const INDENT_PER_LEVEL = 4;
const FOOTNOTES_HEADING = '- heading "Footnotes"';

interface Line {
  readonly indent: number;
  readonly text: string;
}

function linesOf(snapshot: string): Line[] {
  return snapshot.split("\n").map((line) => ({
    indent: line.length - line.trimStart().length,
    text: line.trimStart(),
  }));
}

function withoutFootnotes(lines: readonly Line[]): Line[] {
  const kept: Line[] = [];
  let listAt: number | null = null;
  let headingAt: number | null = null;

  for (const line of lines) {
    if (listAt === null || line.indent <= listAt) {
      listAt = null;

      if (headingAt === line.indent && line.text.startsWith("- list")) {
        listAt = line.indent;
        headingAt = null;
      } else {
        headingAt = line.text.startsWith(FOOTNOTES_HEADING) ? line.indent : null;
        kept.push(line);
      }
    }
  }

  return kept;
}

export async function listItemDepths(page: Page): Promise<number[]> {
  const snapshot = await comments(page).locator("ol.tree").first().ariaSnapshot();

  const indents = withoutFootnotes(linesOf(snapshot))
    .filter((line) => line.text.startsWith("- listitem"))
    .map((line) => line.indent);

  const [first = 0] = indents;

  return indents.map((indent) => (indent - first) / INDENT_PER_LEVEL);
}
