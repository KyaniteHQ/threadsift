import { type APIRequestContext, type Page, type TestInfo, expect, test } from "@playwright/test";

import { itemOf, listAll, postLink, postLinkRaw, settled } from "./api.ts";
import {
  BIG_PAGE_TIMEOUT_MS,
  BIRD_VOCALIZATION,
  BIRD_VOCALIZATION_SENTENCE,
  BREAD,
  BREAD_LAST_SECTION_SENTENCE,
  C2_WIKI_PAGE,
  COMPLETE_SHAKESPEARE,
  ESSAY,
  ESSAY_AUTHOR,
  ESSAY_NORMALIZED,
  ESSAY_SENTENCE,
  ESSAY_SHORT_LINK,
  MDN_CODE_SAMPLE,
  MDN_INLINE_CODE,
  MDN_VIDEO,
  UNTITLED_PAGE,
  UNTITLED_PAGE_SENTENCE,
  UNTITLED_PAGE_TITLE,
  VIDEO_HOST_PAGE_WITH_TEXT,
  WAR_AND_PEACE,
  YOUTUBE_WATCH,
  attachItem,
  expectMarkdown,
  longPage,
  rawMediaOutsideCode,
} from "./articles.ts";
import { ADDED, READING, openLibrary, pasteForId, watchCard } from "./card.ts";
import { jobsOf, storeItem } from "./ingest.ts";
import { htmlPage, newRunId, rowOf } from "./links.ts";

const SOURCE_COLUMN = 0;

interface Run {
  readonly page: Page;
  readonly request: APIRequestContext;
  readonly info: TestInfo;
}

async function breadThroughThePasteBox({ page, request, info }: Run): Promise<number> {
  await openLibrary(page);
  const trace = await watchCard(page);
  const bread = await pasteForId(page, BREAD);

  await expect.poll(async () => (await trace()).titles).toEqual([READING, ADDED]);
  await expect(rowOf(page, bread).locator(".it-meta > span").nth(SOURCE_COLUMN)).toHaveText(
    "Article",
  );

  const item = await settled(request, bread);

  expect(item).toMatchObject({
    source: "article",
    kind: "article",
    status: "ready",
    fetch: "ok",
    author: "Wikipedia",
  });
  expect(item.postedAt, "Bread's posted date").toBeGreaterThan(0);
  expectMarkdown(item.postText);
  expect(item.postText).toContain("food product made from water");
  expect(item.postText, "the last section, past the 512 KiB mark of the page").toContain(
    BREAD_LAST_SECTION_SENTENCE,
  );
  await attachItem(request, info, "1-bread", bread);

  return bread;
}

async function essayByShortLinkThenDirectly({ request, info }: Run): Promise<void> {
  const viaShortLink = await postLinkRaw(request, ESSAY_SHORT_LINK);

  expect(viaShortLink.status).toBe(201);
  expect(viaShortLink.body.item).toMatchObject({
    status: "processing",
    normalizedUrl: ESSAY_NORMALIZED,
    originalUrl: ESSAY_SHORT_LINK,
  });

  const id = viaShortLink.body.item.id;
  const essay = await settled(request, id);

  expect(essay).toMatchObject({ source: "article", kind: "article", fetch: "ok" });
  expect(essay.author).toBe(ESSAY_AUTHOR);
  expect(essay.postedAt, "the essay's posted date").toBeGreaterThan(0);
  expectMarkdown(essay.postText);
  expect(essay.postText).toContain(ESSAY_SENTENCE);
  expect(jobsOf(id).map((job) => job.state)).toEqual(["done"]);
  await attachItem(request, info, "2-essay-by-short-link", id);

  const direct = await postLinkRaw(request, ESSAY);

  expect(direct.status).toBe(200);
  expect(direct.body.item).toMatchObject({ id, status: "processing" });

  const refreshed = await settled(request, id);

  expect(refreshed.fetchedAt, "the refresh stored a later fetch time").toBeGreaterThan(
    essay.fetchedAt ?? Number.POSITIVE_INFINITY,
  );
  expect(refreshed).toMatchObject({ source: "article", postText: essay.postText });
  expect(jobsOf(id).map((job) => job.state)).toEqual(["done", "done"]);
  await attachItem(request, info, "2-essay-refreshed", id);
}

async function bookTooLongToStore({ request, info }: Run): Promise<void> {
  const { body } = await postLinkRaw(request, WAR_AND_PEACE);
  const item = await settled(request, body.item.id, BIG_PAGE_TIMEOUT_MS);

  expect(item).toMatchObject({
    source: "article",
    kind: "article",
    status: "ready",
    fetch: "ok",
    postText: null,
  });
  expect(item.title).toContain("War and Peace");
  expect(item.author).toContain("Tolstoy");
  await attachItem(request, info, "3-war-and-peace", item.id);
}

const STAY_OTHER = [
  ["4-example", "https://example.com/"],
  ["4-youtube", YOUTUBE_WATCH],
  ["4-vimeo-terms", VIDEO_HOST_PAGE_WITH_TEXT],
] as const;

async function pagesThatStayOther({ request, info }: Run): Promise<void> {
  const posted = await Promise.all(
    STAY_OTHER.map(async ([, url]) => (await postLink(request, url)).body.item),
  );

  for (const [index, other] of posted.entries()) {
    const [step, url] = STAY_OTHER[index] ?? ["", ""];

    expect(other, url).toMatchObject({
      source: "other",
      kind: "link",
      status: "ready",
      fetch: "ok",
      author: null,
      postText: null,
      postedAt: null,
    });
    expect(other.title, url).toBeTruthy();
    await attachItem(request, info, step, other.id);
  }
}

async function listHoldsNoPostText(request: APIRequestContext, bread: number): Promise<void> {
  const answer = await (await request.get("/api/items")).text();

  expect(answer, "the list answer holds post text").not.toContain(ESSAY_SENTENCE);
  expect(answer, "the list answer holds post text").not.toContain("postText");
  expect(
    (await listAll(request)).find((item) => item.id === bread),
    "the list shows the Article",
  ).toMatchObject({ source: "article", kind: "article" });
}

test("the article scenario: Bread through the paste box, an essay through a short link and a direct Paste, a book too long to store, and two pages that stay Other", async ({
  page,
  request,
}, info) => {
  test.setTimeout(480_000);
  const run: Run = { page, request, info };
  const bread = await breadThroughThePasteBox(run);

  await essayByShortLinkThenDirectly(run);
  await bookTooLongToStore(run);
  await pagesThatStayOther(run);
  await listHoldsNoPostText(request, bread);
});

test("a page whose extractor would fetch more is read from the page alone", async ({
  request,
}, info) => {
  const { body } = await postLink(request, C2_WIKI_PAGE);

  expect(body.item).toMatchObject({ source: "other", kind: "link", fetch: "no-title" });
  expect(body.item.postText).toBeNull();
  await attachItem(request, info, "c2-wiki", body.item.id);
});

test("real pages with video and audio, and with iframes, keep their text and lose the raw media", async ({
  request,
}, info) => {
  const bird = (await postLink(request, BIRD_VOCALIZATION)).body.item;

  expect(bird).toMatchObject({ source: "article", kind: "article", fetch: "ok" });
  expectMarkdown(bird.postText);
  expect(bird.postText).toContain(BIRD_VOCALIZATION_SENTENCE);
  expect(rawMediaOutsideCode(bird.postText), "raw video or audio left in the text").toEqual([]);
  await attachItem(request, info, "media-wikipedia", bird.id);

  const mdn = (await postLink(request, MDN_VIDEO)).body.item;

  expect(mdn).toMatchObject({ source: "article", kind: "article", fetch: "ok" });
  expect(mdn.postText, "a code sample that mentions the tags was cut").toContain(MDN_CODE_SAMPLE);
  expect(mdn.postText, "an inline code span was cut").toContain(MDN_INLINE_CODE);
  expect(rawMediaOutsideCode(mdn.postText), "raw iframes left in the text").toEqual([]);
  await attachItem(request, info, "media-mdn", mdn.id);
});

test("a real page with no title is an Article whose title comes from Defuddle", async ({
  request,
}, info) => {
  const item = (await postLink(request, UNTITLED_PAGE)).body.item;

  expect(item).toMatchObject({
    source: "article",
    kind: "article",
    fetch: "ok",
    title: UNTITLED_PAGE_TITLE,
  });
  expectMarkdown(item.postText);
  expect(item.postText).toContain(UNTITLED_PAGE_SENTENCE);
  await attachItem(request, info, "untitled-page", item.id);
});

test("a long page served as plain text stays Other with no text", async ({ request }, info) => {
  const item = (await postLink(request, htmlPage(longPage(newRunId())))).body.item;

  expect(item).toMatchObject({ source: "other", kind: "link", postText: null });
  await attachItem(request, info, "plain-text-page", item.id);
});

test("a page over 5 MiB is cut and never read as an article", async ({ request }, info) => {
  const { body } = await postLinkRaw(request, COMPLETE_SHAKESPEARE);
  const item = await settled(request, body.item.id, BIG_PAGE_TIMEOUT_MS);

  expect(item).toMatchObject({ source: "other", kind: "link", fetch: "ok", postText: null });
  expect(item.title).toContain("Shakespeare");
  await attachItem(request, info, "shakespeare", item.id);
});

test("a refresh that finds a short page turns an Article back into Other", async ({
  request,
}, info) => {
  const url = `https://example.com/?article=${newRunId()}`;

  const id = storeItem({
    normalized_url: url,
    source: "article",
    kind: "article",
    title: "Old title",
    author: "Old author",
    post_text: "Old text",
    posted_at: 1000,
    fetched_at: Date.now(),
    fetch_result: "ok",
  });

  const before = await itemOf(request, id);
  expect(before).toMatchObject({ source: "article", postText: "Old text" });

  const pasted = await postLinkRaw(request, url);
  expect(pasted.status).toBe(200);

  const after = await settled(request, id);

  expect(after).toMatchObject({
    source: "other",
    kind: "link",
    title: "Example Domain",
    author: null,
    postText: null,
    postedAt: null,
  });
  await attachItem(request, info, "article-turned-other", id);
});
