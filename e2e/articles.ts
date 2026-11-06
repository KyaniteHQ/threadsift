import type { APIRequestContext, TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";

import { itemOf } from "./api.ts";
import { attachJson, expectNoStuckItems } from "./card.ts";

export const ESSAY = "https://stephango.com/saw";
export const ESSAY_NORMALIZED = "https://stephango.com/saw";
export const ESSAY_SHORT_LINK = "https://is.gd/K2fU2k";
export const ESSAY_SENTENCE = "the machine wants to cut fingers";
export const ESSAY_AUTHOR = "Steph Ango";

export const BREAD = "https://en.wikipedia.org/wiki/Bread";
export const BREAD_LAST_SECTION_SENTENCE = "sand was used as a filler";

export const WAR_AND_PEACE = "https://www.gutenberg.org/files/2600/2600-h/2600-h.htm";
export const COMPLETE_SHAKESPEARE = "https://www.gutenberg.org/files/100/100-h/100-h.htm";
export const VIDEO_HOST_PAGE_WITH_TEXT = "https://vimeo.com/terms";
export const YOUTUBE_WATCH = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
export const C2_WIKI_PAGE = "https://wiki.c2.com/?WelcomeVisitors";

export const BIG_PAGE_TIMEOUT_MS = 180_000;

const FILLER_TEXT = Array.from({ length: 140 }, (_, index) => `word${index}`).join(" ");

export function pageWithMedia(run: string): string {
  return `<!doctype html><html><head><title>Media ${run}</title></head><body><article><h1>Heading</h1><p>${FILLER_TEXT}.</p><p>Before the video.</p><video src="https://example.org/clip.mp4" controls></video><p>Between.</p><audio src="https://example.org/a.mp3"></audio><iframe src="https://example.org/frame"></iframe><p>After the media.</p><pre><code>&lt;iframe&gt;&lt;/iframe&gt;</code></pre><p>The end of the page.</p></article></body></html>`;
}

export function pageWithoutTitle(run: string): string {
  return `<!doctype html><html><head></head><body><article><h1>Heading ${run}</h1><p>${FILLER_TEXT}.</p></article></body></html>`;
}

export function servedAsHtml(html: string): string {
  return `https://httpbin.dev/response-headers?Content-Type=text%2Fhtml&t=${encodeURIComponent(html)}`;
}

export async function attachItem(
  request: APIRequestContext,
  info: TestInfo,
  step: string,
  id: number,
): Promise<void> {
  await attachJson(info, `item-${step}.json`, JSON.stringify(await itemOf(request, id), null, 2));
  expectNoStuckItems(step);
}

export function expectMarkdown(postText: string | null): void {
  expect(postText, "post text that Defuddle did not convert").not.toMatch(
    /<\/?(?:p|div|article|h[1-6])\b/u,
  );
}
