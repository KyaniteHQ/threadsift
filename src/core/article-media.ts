import { webUrlOf } from "./addresses.ts";
import { type EmbedLink, embedLinkOf } from "./embed-links.ts";

export function baseOf(document: Document, url: string): string {
  const declared = document.querySelector("base[href]")?.getAttribute("href");
  const base = declared === null || declared === undefined ? null : URL.parse(declared, url);

  return base?.href ?? url;
}

function webUrl(source: string | null, base: string): string | null {
  return source === null || source === "" ? null : (webUrlOf(source, base)?.href ?? null);
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

export function retainedVideos(
  linked: readonly EmbedLink[],
  linkedAddresses: readonly string[],
): readonly string[] {
  const videos = new Set(linked.flatMap(({ url, video }) => (video ? [url] : [])));
  const retained = new Set(linkedAddresses.map((address) => URL.parse(address)?.href ?? ""));

  return [...videos].filter((url) => retained.has(url));
}
