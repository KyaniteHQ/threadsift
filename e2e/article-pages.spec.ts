import { expect, test } from "@playwright/test";

import { itemOf, postLink, postLinkFetched, postLinkRaw, settled } from "./api.ts";
import {
  BIG_PAGE_TIMEOUT_MS,
  BIRD_VOCALIZATION,
  BIRD_VOCALIZATION_FOOTNOTE,
  BIRD_VOCALIZATION_SENTENCE,
  C2_WIKI_PAGE,
  COMPLETE_SHAKESPEARE,
  DATE_ONLY_PAGE,
  DATE_ONLY_POSTED_AT,
  MDN_CODE_SAMPLE,
  MDN_INLINE_CODE,
  MDN_VIDEO,
  NO_OFFSET_PAGE,
  STALLING_PAGE,
  STALLING_SHORT_LINK,
  UNTITLED_PAGE,
  UNTITLED_PAGE_SENTENCE,
  UNTITLED_PAGE_TITLE,
  attachItem,
  expectMarkdown,
  longPage,
  rawMediaOutsideCode,
} from "./articles.ts";
import { attachJson } from "./card.ts";
import { forgetItem, storeItem } from "./ingest.ts";
import { htmlPage, newRunId } from "./links.ts";

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
  expect(bird.postText, "the last footnote, from past byte 524,288 of the page").toContain(
    BIRD_VOCALIZATION_FOOTNOTE,
  );
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
  const {
    body: { item },
    fetches,
  } = await postLinkFetched(request, COMPLETE_SHAKESPEARE, {
    timeout: BIG_PAGE_TIMEOUT_MS,
    retryOn: (fetch) => fetch === "status",
  });

  await attachJson(info, "shakespeare-fetches.json", JSON.stringify(fetches));
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

test("a refresh whose fetch fails keeps the Article", async ({ request }, info) => {
  const url = `https://no-such-host-${newRunId()}.invalid/essay`;

  const kept = {
    source: "article",
    kind: "article",
    title: "Kept title",
    author: "Kept author",
    postText: "Kept text of the Article",
    postedAt: 1_700_000_000_000,
    fetchedAt: 1_700_000_100_000,
  } as const;

  const id = storeItem({
    normalized_url: url,
    source: kept.source,
    kind: kept.kind,
    title: kept.title,
    author: kept.author,
    post_text: kept.postText,
    posted_at: kept.postedAt,
    fetched_at: kept.fetchedAt,
    fetch_result: "ok",
  });

  expect((await postLinkRaw(request, url)).status).toBe(200);

  const after = await settled(request, id);

  expect(after).toMatchObject({ ...kept, status: "ready", reason: null, fetch: "network" });
  await attachItem(request, info, "refresh-fails", id);
});

test("a posted date without a time is midnight UTC, and one with a time but no offset is not stored", async ({
  request,
}, info) => {
  const dateOnly = (await postLink(request, DATE_ONLY_PAGE)).body.item;

  expect(dateOnly).toMatchObject({ source: "article", kind: "article", fetch: "ok" });
  expect(dateOnly.postedAt).toBe(DATE_ONLY_POSTED_AT);
  await attachItem(request, info, "date-only", dateOnly.id);

  const noOffset = (await postLink(request, NO_OFFSET_PAGE)).body.item;

  expect(noOffset).toMatchObject({ source: "article", kind: "article", fetch: "ok" });
  expect(noOffset.postedAt, "a time with no offset names no single instant").toBeNull();
  await attachItem(request, info, "no-offset", noOffset.id);
});

test("a short link to a page that stalls after its headers is resolved from the headers alone", async ({
  request,
}, info) => {
  forgetItem(STALLING_PAGE);
  const pasted = await postLinkRaw(request, STALLING_SHORT_LINK);

  expect(pasted.status).toBe(201);
  expect(pasted.body.item).toMatchObject({
    status: "processing",
    normalizedUrl: STALLING_PAGE,
    originalUrl: STALLING_SHORT_LINK,
  });

  const item = await settled(request, pasted.body.item.id);

  expect(item).toMatchObject({ status: "failed", reason: "timeout", fetch: "timeout" });
  await attachItem(request, info, "stalling-short-link", item.id);
});
