import { parseHTML } from "linkedom";

import { type EmbedLink, embedLinkOf } from "./embed-links.ts";

export function baseOf(document: Document, url: string): string {
  const declared = document.querySelector("base[href]")?.getAttribute("href");
  const base = declared === null || declared === undefined ? null : URL.parse(declared, url);

  return base?.href ?? url;
}

function webUrl(source: string | null, base: string): string | null {
  const url = source === null || source === "" ? null : URL.parse(source, base);

  return url?.protocol === "https:" || url?.protocol === "http:" ? url.href : null;
}

function urlsOf(element: Element, base: string): readonly string[] {
  const sources = [element, ...element.querySelectorAll("source[src]")];
  const urls = new Set<string>();

  for (const source of sources) {
    const url = webUrl(source.getAttribute("src"), base);

    if (url !== null) urls.add(url);
  }

  return [...urls];
}

function linksOf(element: Element, base: string): readonly EmbedLink[] {
  const tag = element.tagName.toLowerCase();

  return urlsOf(element, base).map(
    (url) => (tag === "iframe" ? embedLinkOf(url) : null) ?? { url, video: tag === "video" },
  );
}

function paragraphOf(document: Document, url: string): Element {
  const paragraph = document.createElement("p");
  const anchor = document.createElement("a");

  anchor.setAttribute("href", url);
  anchor.textContent = url;
  paragraph.append(anchor);

  return paragraph;
}

export function replaceMedia(document: Document, base: string): readonly EmbedLink[] {
  const linked: EmbedLink[] = [];

  for (const element of document.querySelectorAll("video, audio, iframe")) {
    const links = linksOf(element, base);

    element.replaceWith(...links.map(({ url }) => paragraphOf(document, url)));
    linked.push(...links);
  }

  return linked;
}

function retainedHrefs(content: string): ReadonlySet<string> {
  const { document } = parseHTML(`<body>${content}</body>`);

  return new Set(
    [...document.querySelectorAll("a[href]")].map(
      (anchor) => URL.parse(anchor.getAttribute("href") ?? "")?.href ?? "",
    ),
  );
}

export function retainedVideos(linked: readonly EmbedLink[], content: string): readonly string[] {
  const videos = new Set(linked.flatMap(({ url, video }) => (video ? [url] : [])));

  if (videos.size === 0) return [];

  const retained = retainedHrefs(content);

  return [...videos].filter((url) => retained.has(url));
}
