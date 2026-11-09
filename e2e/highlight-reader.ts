import { type Locator, type Page, expect } from "@playwright/test";

import { SavedItemResponseSchema } from "../src/http/schemas.ts";
import { KEEP_LABEL, REMOVE_LABEL } from "../web/src/reader-text.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { fontsLoaded, storeSettings, viewportAt } from "./look.ts";
import { reader } from "./reader.ts";
import { post, postUrl } from "./thread-fixtures.ts";
import { type Node, sendThread, threadJson } from "./threads.ts";

export interface Edge {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface PhraseEdges {
  readonly first: Edge;
  readonly last: Edge;
}

export interface Thread {
  readonly id: string;
  readonly text: string;
  readonly comments?: readonly Node[];
  readonly kept?: readonly string[];
}

export async function seedThread(
  screen: FreshScreen,
  { id, text, comments = [], kept = [] }: Readonly<Thread>,
): Promise<number> {
  const { status, response } = await sendThread(screen.context.request, {
    url: postUrl(id),
    content: threadJson(post(id, text), comments),
    digest: {
      title: `Highlights in the Reader ${id}`,
      topic: "Reading",
      tags: ["Notebooks"],
      summary: "A thread to select passages from.",
      keyPoints: ["The cache path matters."],
      keptComments: kept,
    },
  });

  expect(status, await response.text()).toBeLessThan(300);

  return SavedItemResponseSchema.parse(await response.json()).item.id;
}

export function popover(page: Page): Locator {
  return page.locator(".hl-pop");
}

export function keepButton(page: Page): Locator {
  return popover(page).getByRole("button", { name: KEEP_LABEL });
}

export function removeButton(page: Page): Locator {
  return popover(page).getByRole("button", { name: REMOVE_LABEL });
}

export function marks(scope: Locator): Locator {
  return scope.locator("mark[data-highlights]");
}

export function listEntries(page: Page): Locator {
  return reader(page).locator(".hl-entry");
}

export async function openReader(page: Page, id: number, width: number, stored = {}) {
  await viewportAt(page, width);
  await storeSettings(page, stored, `/items/${id}`);
  await expect(reader(page)).toBeVisible();
  await expect(reader(page).locator(".md").first()).toBeVisible();
  await fontsLoaded(page);
}

export function phraseEdges(scope: Locator, phrase: string): Promise<PhraseEdges> {
  return scope.evaluate((root, wanted) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];

    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (node instanceof Text) nodes.push(node);
    }

    const whole = nodes.map((node) => node.data).join("");
    const start = whole.indexOf(wanted);

    if (start === -1) throw new Error(`${wanted} is not in the text`);

    const place = (offset: number) => {
      let rest = offset;

      for (const node of nodes) {
        if (rest <= node.length) return { node, offset: rest };

        rest -= node.length;
      }

      throw new Error("offset past the text");
    };

    const range = document.createRange();
    const from = place(start);
    const to = place(start + wanted.length);
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);

    const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0);
    const first = rects[0] ?? range.getBoundingClientRect();
    const last = rects.at(-1) ?? first;

    return {
      first: { left: first.left, right: first.right, top: first.top, bottom: first.bottom },
      last: { left: last.left, right: last.right, top: last.top, bottom: last.bottom },
    };
  }, phrase);
}

export async function selectBetween(scope: Locator, from: string, to: string): Promise<void> {
  await scope.evaluate(
    (root, [first, last]) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];

      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        if (node instanceof Text) nodes.push(node);
      }

      const whole = nodes.map((node) => node.data).join("");

      const place = (offset: number) => {
        let rest = offset;

        for (const node of nodes) {
          if (rest <= node.length) return { node, offset: rest };

          rest -= node.length;
        }

        throw new Error("offset past the text");
      };

      const start = whole.indexOf(first ?? "");
      const end = whole.indexOf(last ?? "", start) + (last ?? "").length;

      if (start === -1 || end < start) throw new Error(`${first} to ${last} is not in the text`);

      const a = place(start);
      const b = place(end);
      document.getSelection()?.setBaseAndExtent(a.node, a.offset, b.node, b.offset);
    },
    [from, to],
  );
}

export async function selectAcross(page: Page, first: Locator, last: Locator): Promise<void> {
  const from = await first.elementHandle();
  const to = await last.elementHandle();

  await page.evaluate(
    ([start, end]) => {
      const [a, b] = [
        [start, false],
        [end, true],
      ].map(([element, atEnd]) => {
        const walker = document.createTreeWalker(
          element instanceof Element ? element : document.body,
          NodeFilter.SHOW_TEXT,
        );

        let found: Text | null = null;

        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          if (node instanceof Text && node.data.trim() !== "") {
            found = node;

            if (atEnd !== true) break;
          }
        }

        if (found === null) throw new Error("no text to select");

        return found;
      });

      if (a === undefined || b === undefined) return;

      document.getSelection()?.setBaseAndExtent(a, 0, b, b.length);
    },
    [from, to],
  );
}

export async function dragOver(page: Page, scope: Locator, phrase: string): Promise<void> {
  await scope.scrollIntoViewIfNeeded();
  const { first, last } = await phraseEdges(scope, phrase);
  await page.mouse.move(first.left + 1, (first.top + first.bottom) / 2);
  await page.mouse.down();
  await page.mouse.move(last.right - 1, (last.top + last.bottom) / 2, { steps: 8 });
  await page.mouse.up();
}

export async function doubleClickWord(page: Page, scope: Locator, word: string): Promise<void> {
  await scope.scrollIntoViewIfNeeded();
  const { first } = await phraseEdges(scope, word);
  await page.mouse.dblclick((first.left + first.right) / 2, (first.top + first.bottom) / 2);
}

export async function extendByKeys(page: Page, characters: number): Promise<void> {
  for (let count = 0; count < characters; count += 1) await page.keyboard.press("Shift+ArrowRight");
}

export function selectedText(page: Page): Promise<string> {
  return page.evaluate(() => document.getSelection()?.toString() ?? "");
}

export async function markedText(scope: Locator): Promise<string> {
  return (await marks(scope).allTextContents()).join("");
}
