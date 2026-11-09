import Defuddle, { createMarkdownContent } from "defuddle/full";

import { replaceMedia } from "../../src/core/article-media.ts";
import type { SuppliedPage } from "../../src/core/supplied-page.ts";

export interface CapturedPage extends SuppliedPage {
  readonly url: string;
}

function loadedImages(live: Document): ReadonlyMap<string, string> {
  return new Map(
    [...live.images].flatMap(({ src, currentSrc }) =>
      /^https?:/u.test(currentSrc) && src !== currentSrc ? [[src, currentSrc] as const] : [],
    ),
  );
}

function swapInLoadedImages(content: Document, live: Document): void {
  const loaded = loadedImages(live);

  for (const image of content.querySelectorAll("img[src]")) {
    const current = loaded.get(image.getAttribute("src") ?? "");

    if (current !== undefined) image.setAttribute("src", current);
  }
}

export function capturePage(live: Document): CapturedPage {
  const url = live.location.href;
  const extracted = new Defuddle(live, { url }).parse();
  const content = new DOMParser().parseFromString(extracted.content, "text/html");
  const linked = replaceMedia(content, live.baseURI);

  swapInLoadedImages(content, live);

  return {
    url,
    markdown: createMarkdownContent(content.body.innerHTML, url),
    title: live.title.trim() === "" ? extracted.title : live.title,
    author: extracted.author,
    published: extracted.published,
    videos: linked.flatMap(({ url: address, video }) => (video ? [address] : [])),
  };
}
