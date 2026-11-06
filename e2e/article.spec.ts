import { type APIRequestContext, type Page, type TestInfo, expect, test } from "@playwright/test";

import { listAll, postLink, postLinkRaw, settled } from "./api.ts";
import {
  BIG_PAGE_TIMEOUT_MS,
  BREAD,
  BREAD_LATE_SENTENCE,
  BREAD_POSTED_AT,
  ESSAY,
  ESSAY_AUTHOR,
  ESSAY_NORMALIZED,
  ESSAY_POSTED_AT,
  ESSAY_SENTENCE,
  ESSAY_SHORT_LINK,
  ESSAY_TITLE,
  VIDEO_HOST_PAGE_WITH_TEXT,
  WAR_AND_PEACE,
  attachItem,
  expectMarkdown,
  readsWhileProcessing,
} from "./articles.ts";
import {
  ADDED,
  READING,
  attachJson,
  itemReadPaths,
  openLibrary,
  pasteForId,
  watchCard,
} from "./card.ts";
import { forgetItem, jobsOf } from "./ingest.ts";
import { rowOf, throughRedirects } from "./links.ts";
import { isContainerTarget } from "./target.ts";

const SOURCE_COLUMN = 0;

interface Run {
  readonly page: Page;
  readonly request: APIRequestContext;
  readonly info: TestInfo;
}

async function breadThroughThePasteBox({ page, request, info }: Run): Promise<number> {
  forgetItem(BREAD);
  await openLibrary(page);
  const trace = await watchCard(page);
  const readPaths = itemReadPaths(page);
  const bread = await pasteForId(page, BREAD);

  await expect.poll(async () => (await trace()).titles).toEqual([READING, ADDED]);
  await expect(rowOf(page, bread).locator(".it-meta > span").nth(SOURCE_COLUMN)).toHaveText(
    "Article",
  );

  expect(readPaths(), "the page polls the status route and never the detail route").toContain(
    `/api/items/${bread}/status`,
  );
  expect(readPaths()).not.toContain(`/api/items/${bread}`);

  const item = await settled(request, bread);

  expect(item).toMatchObject({
    source: "article",
    kind: "article",
    status: "ready",
    fetch: "ok",
    author: "Wikipedia",
  });
  expect(item.postedAt, "Bread's posted date").toBe(BREAD_POSTED_AT);
  expectMarkdown(item.postText);
  expect(item.postText).toContain("food product made from water");
  expect(item.postText, "a sentence from deep in the article").toContain(BREAD_LATE_SENTENCE);
  await attachItem(request, info, "1-bread", bread);

  return bread;
}

async function essayByShortLinkThenDirectly({ request, info }: Run): Promise<void> {
  forgetItem(ESSAY_NORMALIZED);
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
  expect(essay.title).toContain(ESSAY_TITLE);
  expect(essay.author).toBe(ESSAY_AUTHOR);
  expect(essay.postedAt, "the essay's posted date").toBe(ESSAY_POSTED_AT);
  expect(
    (await listAll(request)).filter((item) => item.normalizedUrl === ESSAY_SHORT_LINK),
    "nothing is listed under the short URL",
  ).toEqual([]);
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

async function bookTooLongToStore({ request, info }: Run, other: number): Promise<void> {
  const { body } = await postLinkRaw(request, WAR_AND_PEACE);
  const reads = await readsWhileProcessing(request, body.item.id, other);
  const item = await settled(request, body.item.id, BIG_PAGE_TIMEOUT_MS);

  await attachJson(info, "3-war-and-peace-reads.json", JSON.stringify(reads, null, 2));

  expect(item.title).toContain("War and Peace");

  if (isContainerTarget()) {
    expect(reads.reads, "reads of another Item made while the book was read").toBeGreaterThan(3);
    expect(
      reads.slowestMs,
      "the slowest read of another Item while the book was read",
    ).toBeLessThan(1000);
    expect(item).toMatchObject({
      source: "article",
      kind: "article",
      status: "ready",
      fetch: "ok",
      postText: null,
    });
    expect(item.author).toContain("Tolstoy");
  } else {
    expect(item, "the Worker cuts the book at its HTML limit, so it is never read").toMatchObject({
      source: "other",
      kind: "link",
      status: "ready",
      fetch: "ok",
      author: null,
      postText: null,
    });
  }

  await attachItem(request, info, "3-war-and-peace", item.id);
}

const STAY_OTHER = [
  ["4-example", "https://example.com/"],
  ["4-vimeo-terms", VIDEO_HOST_PAGE_WITH_TEXT],
  ["4-vimeo-terms-by-redirect", throughRedirects(VIDEO_HOST_PAGE_WITH_TEXT, 1)],
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

async function listAndStatusHoldNoPostText(
  request: APIRequestContext,
  bread: number,
): Promise<void> {
  const answer = await (await request.get("/api/items")).text();

  expect(answer, "the list answer holds post text").not.toContain(ESSAY_SENTENCE);
  expect(answer, "the list answer holds post text").not.toContain("postText");

  const status = await request.get(`/api/items/${bread}/status`);

  expect(status.status()).toBe(200);
  expect(await status.text(), "the status answer holds post text").not.toContain("postText");
  expect((await request.get("/api/items/999999999/status")).status()).toBe(404);
  expect(
    (await listAll(request)).find((item) => item.id === bread),
    "the list shows the Article",
  ).toMatchObject({ source: "article", kind: "article" });
}

test("the article scenario: Bread through the paste box, an essay through a short link and a direct Paste, a book too long to store or to read, and pages that stay Other", async ({
  page,
  request,
}, info) => {
  test.setTimeout(480_000);
  const run: Run = { page, request, info };
  const bread = await breadThroughThePasteBox(run);

  await essayByShortLinkThenDirectly(run);
  await bookTooLongToStore(run, bread);
  await pagesThatStayOther(run);
  await listAndStatusHoldNoPostText(request, bread);

  if (isContainerTarget()) {
    expect(0, "deliberate shard failure probe").toBe(1);
  }
});
