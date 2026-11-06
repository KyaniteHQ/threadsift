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

export const BIRD_VOCALIZATION = "https://en.wikipedia.org/wiki/Bird_vocalization";

export const BIRD_VOCALIZATION_SENTENCE =
  "are the sounds produced by birds that are melodious to the human ear.";

export const MDN_VIDEO =
  "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video";

export const MDN_CODE_SAMPLE = '<video controls width="250">';
export const MDN_INLINE_CODE = "You can use `<video>` for audio content as well";

export const UNTITLED_PAGE = "https://httpbin.org/html";

export const UNTITLED_PAGE_TITLE = "Herman Melville";

export const UNTITLED_PAGE_SENTENCE =
  "Availing himself of the mild, summer-cool weather that now reigned in these latitudes";

const FILLER_TEXT = Array.from({ length: 140 }, (_, index) => `word${index}`).join(" ");

const CODE_SPAN = /```[\s\S]*?```|`[^`\n]*`/gu;

const RAW_MEDIA_TAG = /<(?:video|audio|iframe)\b[^>]*>/giu;

export function longPage(run: string): string {
  return `<!doctype html><html><head><title>Long ${run}</title></head><body><article><h1>Heading</h1><p>${FILLER_TEXT}.</p></article></body></html>`;
}

export function rawMediaOutsideCode(postText: string | null): string[] {
  return (postText ?? "").replaceAll(CODE_SPAN, "").match(RAW_MEDIA_TAG) ?? [];
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
