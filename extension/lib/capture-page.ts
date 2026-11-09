import Defuddle, { createMarkdownContent } from "defuddle/full";

import { replaceMedia } from "../../src/core/article-media.ts";
import type { SuppliedPage } from "../../src/core/supplied-page.ts";

export interface CapturedPage extends SuppliedPage {
  readonly url: string;
}

const DESCRIPTOR = /^\d+(?:\.\d+)?[wx]$/u;

const SELECTION_ATTRIBUTES = [
  "srcset",
  "sizes",
  "data-src",
  "data-srcset",
  "data-lazy-src",
  "loading",
] as const;

interface ShownImage {
  readonly selected: string;
  readonly candidates: readonly string[];
}

function urlsOf(value: string | null): readonly string[] {
  return (value ?? "")
    .trim()
    .split(/\s+/u)
    .map((token) => token.replaceAll(/^,|,$/gu, ""))
    .filter((token) => token !== "" && !DESCRIPTOR.test(token));
}

function candidatesOf(image: Element, base: string): readonly string[] {
  const sources = [...(image.closest("picture")?.querySelectorAll("source") ?? [])];

  const raw = [image, ...sources].flatMap((element) =>
    ["src", "data-src", "srcset", "data-srcset"].flatMap((name) =>
      urlsOf(element.getAttribute(name)),
    ),
  );

  return raw.flatMap((value) => URL.parse(value, base)?.href ?? []);
}

function shownImages(live: Document): readonly ShownImage[] {
  return [...live.images].flatMap((image) =>
    /^https?:/u.test(image.currentSrc)
      ? [{ selected: image.currentSrc, candidates: candidatesOf(image, live.baseURI) }]
      : [],
  );
}

function showSelected(image: Element, selected: string): void {
  image.setAttribute("src", selected);

  for (const name of SELECTION_ATTRIBUTES) image.removeAttribute(name);

  for (const source of image.closest("picture")?.querySelectorAll("source") ?? []) {
    source.remove();
  }
}

function showSelectedImages(content: Document, shown: readonly ShownImage[], base: string): void {
  for (const image of content.querySelectorAll("img")) {
    const own = candidatesOf(image, base);

    const match = shown.find(({ candidates }) =>
      own.some((address) => candidates.includes(address)),
    );

    if (match !== undefined) showSelected(image, match.selected);
  }
}

export function capturePage(live: Document): CapturedPage {
  const url = live.location.href;
  const shown = shownImages(live);
  const extracted = new Defuddle(live, { url }).parse();
  const content = new DOMParser().parseFromString(extracted.content, "text/html");
  const linked = replaceMedia(content, live.baseURI);

  showSelectedImages(content, shown, live.baseURI);

  return {
    url,
    markdown: createMarkdownContent(content.body.innerHTML, url),
    title: live.title.trim() === "" ? extracted.title : live.title,
    author: extracted.author,
    published: extracted.published,
    videos: linked.flatMap(({ url: address, video }) => (video ? [address] : [])),
  };
}
