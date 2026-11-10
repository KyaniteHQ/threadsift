import type { Locator } from "@playwright/test";

import type { ArticleScreen } from "./article-screen.ts";
import { keepBetween, openReader } from "./highlight-reader.ts";
import { DESKTOP } from "./look.ts";
import { reader } from "./reader.ts";

export const STORED_PICTURE = ".rd-media";

export function collapsed(text: string): string {
  return text.replaceAll(/\s+/gu, " ");
}

export interface Around {
  readonly before: string;
  readonly after: string;
  readonly shown: string;
}

export function around(body: Locator, selector: string, index: number): Promise<Around> {
  return body.evaluate(
    (root, [picturesSelector, at]) => {
      const picture = root.querySelectorAll(picturesSelector ?? "")[at];

      if (picture === undefined) throw new Error(`no ${picturesSelector} at ${at}`);

      const image = picture.querySelector("img");
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let before = "";
      let after = "";

      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const text = node.nodeValue?.trim() ?? "";
        const outside = !picture.contains(node) && node.parentElement?.closest("a, pre") === null;

        if (text.length < 20 || !outside) continue;

        if (picture.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING) {
          before = text.slice(-20).trim();
        } else if (after === "") {
          after = text.slice(0, 20).trim();
        }
      }

      return {
        before,
        after,
        shown:
          image === null ? "" : image.alt === "" ? (image.getAttribute("src") ?? "") : image.alt,
      };
    },
    [selector, index] as const,
  );
}

export async function openArticleBody(library: Readonly<ArticleScreen>): Promise<Locator> {
  const { page } = library.screen;

  await openReader(page, library.articleId, DESKTOP.width);

  return reader(page).locator(".md").first();
}

export async function keepAround(library: Readonly<ArticleScreen>, index: number) {
  const body = await openArticleBody(library);
  const found = await around(body, STORED_PICTURE, index);
  const { screen, articleId } = library;

  return {
    ...(await keepBetween(screen, articleId, body, found.before, found.after)),
    around: found,
  };
}

export function emptyAltPicture(body: Locator): Promise<number> {
  return body.evaluate((root) =>
    Array.from(root.querySelectorAll(".rd-media")).findIndex(
      (picture) => picture.querySelector("img")?.alt === "",
    ),
  );
}
