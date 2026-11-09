import { type Locator, type Page, expect } from "@playwright/test";

import { SavedItemResponseSchema } from "../src/http/schemas.ts";
import type { Edges } from "../web/src/place-popover.ts";
import { KEEP_LABEL, REMOVE_LABEL } from "../web/src/reader-text.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { fontsLoaded, storeSettings, viewportAt } from "./look.ts";
import { reader } from "./reader.ts";
import { post, postUrl } from "./thread-fixtures.ts";
import { type Node, sendThread, threadJson } from "./threads.ts";

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

function rangeIn(scope: Locator, from: string, to: string, select: boolean): Promise<Edges> {
  return scope.evaluate(
    (root, [first, last, selecting]) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];

      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        if (node instanceof Text) nodes.push(node);
      }

      const whole = nodes.map((node) => node.data).join("");
      const start = whole.indexOf(first ?? "");
      const end = whole.indexOf(last ?? "", start) + (last ?? "").length;

      if (start === -1 || end < start) throw new Error(`${first} to ${last} is not in the text`);

      const place = (offset: number) => {
        let rest = offset;

        for (const node of nodes) {
          if (rest <= node.length) return { node, offset: rest };

          rest -= node.length;
        }

        throw new Error("offset past the text");
      };

      const a = place(start);
      const b = place(end);
      const range = document.createRange();
      range.setStart(a.node, a.offset);
      range.setEnd(b.node, b.offset);

      if (selecting) {
        document.getSelection()?.setBaseAndExtent(a.node, a.offset, b.node, b.offset);
      }

      const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0);
      const head = rects[0] ?? range.getBoundingClientRect();
      const tail = rects.at(-1) ?? head;

      return {
        first: { left: head.left, right: head.right, top: head.top, bottom: head.bottom },
        last: { left: tail.left, right: tail.right, top: tail.top, bottom: tail.bottom },
      };
    },
    [from, to, select] as const,
  );
}

export function phraseEdges(scope: Locator, phrase: string): Promise<Edges> {
  return rangeIn(scope, phrase, phrase, false);
}

export async function selectBetween(scope: Locator, from: string, to: string): Promise<void> {
  await rangeIn(scope, from, to, true);
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
