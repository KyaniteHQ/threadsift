import { type APIResponse, expect, test } from "@playwright/test";

import type { Digest } from "../src/core/ai-contract.ts";
import { SavedItemResponseSchema } from "../src/http/schemas.ts";
import { settled } from "./api.ts";
import { type Library, closeLibrary, openLibrary } from "./media-pages.ts";
import { imageRows } from "./media.ts";
import { AUTHORED_DIGEST, generationOf, threadHeaders } from "./threads.ts";

test.describe.configure({ timeout: 240_000 });

const WORDS = Array.from({ length: 140 }, (_, index) => `word${index}`).join(" ");

let library: Library;

test.beforeEach(async () => {
  library = await openLibrary();
});

test.afterEach(async () => {
  await closeLibrary(library);
});

interface PageBody {
  readonly markdown: string;
  readonly title: string;
  readonly author?: string;
  readonly published?: string;
}

function savePage(
  url: string,
  page: Readonly<PageBody>,
  digest?: Readonly<Digest>,
): Promise<APIResponse> {
  return library.owner.post("/api/items", { data: { url, page, digest } });
}

async function expectShortRefresh(url: string, id: number): Promise<void> {
  const { owner, instance } = library;

  const refreshed = await savePage(
    url,
    { markdown: "Only a few words now.", title: "The same post, shortened" },
    { ...AUTHORED_DIGEST, title: "A second Digest" },
  );

  expect(refreshed.status()).toBe(200);
  expect(await settled(owner, id)).toMatchObject({
    source: "reddit",
    kind: "reddit-post",
    title: "The same post, shortened",
    postText: null,
    postedAt: null,
    digestTitle: AUTHORED_DIGEST.title,
  });
  expect(imageRows(instance, id)).toEqual([]);
  expect(generationOf(instance, id)).toBe(2);
}

test("a Reddit post or comment link takes a page through the page pipeline: no thread header, its images stored, the 100-word minimum applied, and the community from the link", async () => {
  const { owner, instance } = library;
  const run = Date.now().toString(36);
  const postUrl = `https://www.reddit.com/r/typescript/comments/p${run}/a_post/`;

  const saved = await savePage(
    postUrl,
    {
      markdown: `Post text ${WORDS}\n\n![a figure](https://images.invalid/figure.png)\n\n> a comment the page carried`,
      title: "  A   post\n title ",
      author: " ada ",
      published: "2025-03-04T05:06:07Z",
    },
    AUTHORED_DIGEST,
  );

  expect(saved.status()).toBe(201);

  const { item } = SavedItemResponseSchema.parse(await saved.json());
  const done = await settled(owner, item.id);

  expect(done).toMatchObject({
    status: "ready",
    source: "reddit",
    kind: "reddit-post",
    fetch: "ok",
    title: "A post title",
    author: "ada",
    community: "typescript",
    postedAt: Date.parse("2025-03-04T05:06:07Z"),
    normalizedUrl: `https://reddit.com/r/all/comments/p${run}/`,
    digestTitle: AUTHORED_DIGEST.title,
  });
  expect(done.postText).toContain("> a comment the page carried");
  expect(done.comments).toMatchObject({ received: 0, kept: 0 });
  expect(threadHeaders(instance, item.id)).toEqual([]);
  expect(imageRows(instance, item.id)).toMatchObject([
    { source_url: "https://images.invalid/figure.png", outcome: "failed" },
  ]);
  expect(generationOf(instance, item.id)).toBe(1);

  await expectShortRefresh(postUrl, item.id);
});

test("a Reddit comment link takes a page, a Reddit page under 100 words keeps its title and community and no text, and a page with no title is left untitled", async () => {
  const { owner, instance } = library;
  const run = Date.now().toString(36);
  const postUrl = `https://www.reddit.com/r/typescript/comments/q${run}/a_post/`;

  const commentSaved = await savePage(`${postUrl}c${run}/`, {
    markdown: WORDS,
    title: "A comment",
  });

  expect(commentSaved.status()).toBe(201);
  expect(
    await settled(owner, SavedItemResponseSchema.parse(await commentSaved.json()).item.id),
  ).toMatchObject({ source: "reddit", kind: "reddit-comment", postText: WORDS });

  const short = await savePage(`${postUrl}s${run}/`, {
    markdown: "Only a few words here.\n\n![a figure](https://images.invalid/short.png)",
    title: "A short post",
  });

  const { item: shortItem } = SavedItemResponseSchema.parse(await short.json());

  expect(await settled(owner, shortItem.id)).toMatchObject({
    source: "reddit",
    kind: "reddit-comment",
    title: "A short post",
    community: "typescript",
    fetch: "ok",
    postText: null,
  });
  expect(imageRows(instance, shortItem.id)).toEqual([]);

  const untitled = await savePage(`${postUrl}d${run}/`, { markdown: WORDS, title: "  " });

  expect(untitled.status()).toBe(201);
  expect(
    await settled(owner, SavedItemResponseSchema.parse(await untitled.json()).item.id),
  ).toMatchObject({ title: null, fetch: "no-title", postText: null });
});
