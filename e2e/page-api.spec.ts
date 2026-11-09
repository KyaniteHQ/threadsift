import { type APIResponse, expect, test } from "@playwright/test";

import { ErrorResponseSchema, SavedItemResponseSchema } from "../src/http/schemas.ts";
import { itemOf, listAll, settled } from "./api.ts";
import { STALLING_PAGE } from "./articles.ts";
import { claimLostLines, jobsOf } from "./ingest.ts";
import { type Library, closeLibrary, openLibrary } from "./media-pages.ts";
import { imageRows } from "./media.ts";

test.describe.configure({ timeout: 240_000 });

const PAGE_LIMIT_BYTES = 1_000_000;

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

function savePage(url: string, page: Readonly<PageBody>, content?: string): Promise<APIResponse> {
  return library.owner.post("/api/items", { data: { url, page, content } });
}

async function errorOf(response: Readonly<APIResponse>): Promise<string> {
  return ErrorResponseSchema.parse(await response.json()).error;
}

test("a page is published like a fetched article for a host the server could not reach, with its images and date", async () => {
  const { owner, instance } = library;
  const url = `https://page-only-${Date.now()}.invalid/article?utm_source=tab#top`;

  const response = await savePage(url, {
    markdown: `# Heading\n\n${WORDS}\n\n![a figure](https://images.invalid/figure.png)\n\n[a link](https://links.invalid/target)`,
    title: "  A   captured\n title ",
    author: " Ada Writer ",
    published: "2025-03-04T05:06:07Z",
  });

  expect(response.status()).toBe(201);

  const { item, url: path } = SavedItemResponseSchema.parse(await response.json());
  const done = await settled(owner, item.id);

  expect(path).toBe(`/items/${item.id}`);
  expect(done).toMatchObject({
    status: "ready",
    source: "article",
    kind: "article",
    fetch: "ok",
    title: "A captured title",
    author: "Ada Writer",
    postedAt: Date.parse("2025-03-04T05:06:07Z"),
    normalizedUrl: `https://${new URL(url).host}/article`,
  });
  expect(done.postText).toContain("[a link](https://links.invalid/target)");
  expect(imageRows(instance, item.id)).toMatchObject([
    { source_url: "https://images.invalid/figure.png", outcome: "failed" },
  ]);
});

test("a page of fewer than 100 words saves the link with its title and no text, and a page with no title leaves the link untitled", async () => {
  const { owner } = library;

  const short = await savePage("https://short-page.invalid/a", {
    markdown: "Only a few words here.",
    title: "Short page",
  });

  expect(short.status()).toBe(201);

  const { item } = SavedItemResponseSchema.parse(await short.json());

  expect(await settled(owner, item.id)).toMatchObject({
    source: "other",
    kind: "link",
    title: "Short page",
    fetch: "ok",
    postText: null,
  });

  const untitled = await savePage("https://untitled-page.invalid/a", {
    markdown: WORDS,
    title: "   ",
  });

  const { item: bare } = SavedItemResponseSchema.parse(await untitled.json());

  expect(await settled(owner, bare.id)).toMatchObject({
    status: "ready",
    title: null,
    fetch: "no-title",
    postText: null,
  });
});

test("a page that a link cannot take is refused with its field named, and nothing is stored", async () => {
  const { owner } = library;
  const page = { markdown: WORDS, title: "Refused" };

  const cases = [
    { url: "https://www.reddit.com/r/typescript/comments/abc123/a_post/", error: /^page: only/u },
    { url: "https://x.com/someone/status/1234567890", error: /^page: only/u },
    { url: "https://github.com/kepano/defuddle", error: /^page: only/u },
    { url: "http://127.0.0.1:9/page", error: /^url: /u },
  ];

  for (const { url, error } of cases) {
    const response = await savePage(url, page);

    expect(response.status(), url).toBe(400);
    expect(await errorOf(response), url).toMatch(error);
  }

  const both = await savePage("https://both.invalid/a", page, "{}");

  expect(both.status()).toBe(400);
  expect(await errorOf(both)).toBe("page: a link takes content or a page, not both");
  expect(await listAll(owner)).toEqual([]);
});

const FILLERS = [
  { name: "one-byte characters", text: "x" },
  { name: "two-byte characters", text: "é" },
  { name: "three-byte characters", text: "€" },
  { name: "four-byte characters", text: "😀" },
  { name: "quotes, which JSON escapes to two bytes", text: '"' },
  { name: "newlines, which JSON escapes to two bytes", text: "\n" },
  { name: "control characters, which JSON escapes to six bytes", text: "\u0001" },
];

function pageOfBytes(filler: string, bytes: number): PageBody {
  const title = "Boundary";
  const overhead = Buffer.byteLength(JSON.stringify({ markdown: "", title }));
  const unit = Buffer.byteLength(JSON.stringify(filler)) - 2;
  const room = bytes - overhead;

  const page = {
    markdown: filler.repeat(Math.floor(room / unit)) + "x".repeat(room % unit),
    title,
  };

  expect(Buffer.byteLength(JSON.stringify(page)), "the page the spec built").toBe(bytes);

  return page;
}

async function expectBoundary(text: string): Promise<void> {
  const { owner, instance } = library;
  const url = `https://boundary-${Date.now()}.invalid/a`;

  const exact = await savePage(url, pageOfBytes(text, PAGE_LIMIT_BYTES));

  expect(exact.status()).toBe(201);

  const { item } = SavedItemResponseSchema.parse(await exact.json());
  const before = await settled(owner, item.id);
  const jobs = jobsOf(item.id, instance);

  const over = await savePage(url, pageOfBytes(text, PAGE_LIMIT_BYTES + 1));

  expect(over.status()).toBe(413);
  expect(await errorOf(over)).toBe("page: longer than 1,000,000 bytes");
  expect(await itemOf(owner, item.id)).toEqual(before);
  expect(jobsOf(item.id, instance)).toEqual(jobs);
  expect(await listAll(owner)).toHaveLength(1);
}

for (const { name, text } of FILLERS) {
  test(`a page of ${name} is saved at exactly 1,000,000 bytes and refused one byte over, leaving the Item as it was`, () =>
    expectBoundary(text));
}

test("a fetch that is still running when a page arrives cannot overwrite the page", async () => {
  const { owner, instance } = library;

  const pasted = await owner.post("/api/items", { data: { url: STALLING_PAGE } });
  const { item } = SavedItemResponseSchema.parse(await pasted.json());

  await expect
    .poll(() => jobsOf(item.id, instance, "fetch").map(({ state }) => state), { timeout: 30_000 })
    .toEqual(["running"]);

  const [stalled] = jobsOf(item.id, instance, "fetch");

  const saved = await savePage(STALLING_PAGE, {
    markdown: WORDS,
    title: "Captured while fetching",
  });

  expect(saved.status()).toBe(200);
  await expect
    .poll(async () => (await itemOf(owner, item.id)).title)
    .toBe("Captured while fetching");
  await expect
    .poll(() => claimLostLines(instance, stalled?.id ?? 0).length, { timeout: 60_000 })
    .toBeGreaterThan(0);

  expect(await settled(owner, item.id)).toMatchObject({
    status: "ready",
    title: "Captured while fetching",
    fetch: "ok",
    source: "article",
  });
});
