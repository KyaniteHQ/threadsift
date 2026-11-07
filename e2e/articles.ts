import type { APIRequestContext, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { Digest } from "../src/core/ai-contract.ts";
import { type Fetch, attempted, getItem, itemOf, postLinkRaw, settled } from "./api.ts";
import { attachJson, expectNoStuckItems } from "./card.ts";

export const ESSAY = "https://stephango.com/saw";
export const ESSAY_NORMALIZED = "https://stephango.com/saw";
export const ESSAY_SHORT_LINK = "https://is.gd/K2fU2k";
export const ESSAY_SENTENCE = "the machine wants to cut fingers";
export const ESSAY_AUTHOR = "Steph Ango";
export const ESSAY_TITLE = "Use the saw, fear the saw";
export const ESSAY_POSTED_AT = Date.parse("2025-10-20T00:00:00Z");

export const BREAD = "https://en.wikipedia.org/wiki/Bread";
export const BREAD_LATE_SENTENCE = "sand was used as a filler";
export const BREAD_POSTED_AT = Date.parse("2002-01-29T04:35:03Z");

export const WAR_AND_PEACE = "https://www.gutenberg.org/files/2600/2600-h/2600-h.htm";

export const WAR_AND_PEACE_LAST_SENTENCE =
  "to renounce a freedom that does not exist, and to recognize a dependence of which we are not conscious";

export const WAR_AND_PEACE_LAST_WORD = "Copernicus";
export const COMPLETE_SHAKESPEARE = "https://www.gutenberg.org/files/100/100-h/100-h.htm";
export const VIDEO_HOST_PAGE_WITH_TEXT = "https://vimeo.com/terms";
export const C2_WIKI_PAGE = "https://wiki.c2.com/?WelcomeVisitors";

export const BIG_PAGE_TIMEOUT_MS = 180_000;

export const BIRD_VOCALIZATION =
  "https://en.wikipedia.org/w/index.php?title=Bird_vocalization&oldid=1380253618";

export const BIRD_VOCALIZATION_FOOTNOTE =
  "Meet the Kid Who Wowed the Internet With His Incredibly Accurate Bird Calls";

export const BIRD_VOCALIZATION_SENTENCE =
  "are the sounds produced by birds that are melodious to the human ear.";

export const MDN_VIDEO =
  "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video";

export const MDN_CODE_SAMPLE = '<video controls width="250">';
export const MDN_INLINE_CODE = "You can use `<video>` for audio content as well";

export const STALLING_PAGE = "https://httpbin.org/drip?duration=10&numbytes=5&code=200";
export const STALLING_SHORT_LINK = "https://is.gd/3a9eIm";

export const DATE_ONLY_PAGE =
  "https://matklad.github.io/2023/10/12/lsp-could-have-been-better.html";

export const DATE_ONLY_POSTED_AT = Date.parse("2023-10-12T00:00:00Z");

export const NO_OFFSET_PAGE =
  "https://jvns.ca/blog/2024/01/05/do-we-think-of-git-commits-as-diffs--snapshots--or-histories/";

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

export async function readsWhileProcessing(
  request: APIRequestContext,
  watched: number,
  other: number,
): Promise<{ readonly reads: number; readonly slowestMs: number }> {
  let reads = 0;
  let slowestMs = 0;

  await expect
    .poll(
      async () => {
        const started = performance.now();
        const { status } = await getItem(request, other);
        slowestMs = Math.max(slowestMs, performance.now() - started);
        reads += 1;
        expect(status, `GET /api/items/${other} while Item ${watched} is read`).toBe(200);

        return (await itemOf(request, watched)).status;
      },
      { timeout: BIG_PAGE_TIMEOUT_MS, intervals: [50] },
    )
    .not.toBe("processing");

  return { reads, slowestMs };
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

const GUTENBERG_HOST_FAILURES: ReadonlySet<Fetch> = new Set(["timeout", "status"]);

export async function gutenbergPasted<Result>(
  name: string,
  attempt: () => Promise<Result>,
  fetchOf: (result: Result) => Fetch,
) {
  const pasted = await attempted(attempt, fetchOf, (fetch) => GUTENBERG_HOST_FAILURES.has(fetch));

  await attachJson(test.info(), `${name}-fetches.json`, JSON.stringify(pasted.fetches));
  expect(
    fetchOf(pasted.last),
    `the fetch result of ${name}, attempt by attempt: ${pasted.fetches.join(", ")}`,
  ).toBe("ok");

  return pasted;
}

export function pasteGutenberg(
  request: APIRequestContext,
  {
    name,
    url,
    digest,
    timeout = BIG_PAGE_TIMEOUT_MS,
  }: Readonly<{ name: string; url: string; digest?: Readonly<Digest>; timeout?: number }>,
) {
  return gutenbergPasted(
    name,
    async () => {
      const { status, body } = await postLinkRaw(request, url, digest);

      return { status, item: await settled(request, body.item.id, timeout) };
    },
    ({ item }) => item.fetch,
  );
}
