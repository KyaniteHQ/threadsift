import { expect, test } from "@playwright/test";

import { postTextOf } from "./files.ts";
import {
  EMBED_LINK,
  EMBED_PAGE,
  FAILING_IMAGES,
  FAILING_PAGE,
  INLINE_PAGE,
  LARGE_IMAGE,
  LAZY_VIDEO,
  LAZY_VIDEO_PAGE,
  type Library,
  MIXED_FAILED_IMAGE,
  MIXED_PAGE,
  OVERSIZED_IMAGE,
  OVERSIZED_PAGE,
  REPEATED_IMAGE,
  REPEATED_PAGE,
  RESPONSIVE_PAGE,
  RESPONSIVE_SVG,
  closeLibrary,
  openLibrary,
  pasteArticle,
} from "./media-pages.ts";
import {
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  expectOwnBytes,
  expectServed,
  imageFiles,
  imageRows,
  routesIn,
  storedKeys,
  videoRows,
} from "./media.ts";

test.describe.configure({ timeout: 300_000 });

let library: Library;

test.beforeEach(async () => {
  library = await openLibrary();
});

test.afterEach(async () => {
  await closeLibrary(library);
});

test("relative, lazy and responsive images are stored once each, served with their own bytes, and an SVG stays the page's own link", async () => {
  const { instance, owner } = library;
  const item = await pasteArticle(owner, "responsive", RESPONSIVE_PAGE);
  const rows = imageRows(instance, item.id);
  const stored = rows.filter(({ outcome }) => outcome === "stored");
  const svg = rows.filter(({ source_url }) => source_url.endsWith(RESPONSIVE_SVG));

  expect(stored.length, "the raster images of the article").toBeGreaterThanOrEqual(5);
  expect(svg).toMatchObject([{ outcome: "failed", reason: "not-an-image", file_key: null }]);
  expect(imageFiles(instance, item.id), "one file for each stored row, none for the SVG").toEqual(
    storedKeys(rows),
  );

  for (const row of stored) expectOwnBytes(row, instance.readFile(row.file_key ?? ""));

  expect(routesIn(item.postText).toSorted()).toEqual(
    storedKeys(rows).map((key) => `/api/files/${key}`),
  );
  expect(item.postText, "the SVG stays a link to its source").toContain(`](${svg[0]?.source_url}`);
  expect(item.postText, "no stored image keeps its source address").not.toContain(
    `](${stored[0]?.source_url}`,
  );

  const [first] = stored;

  if (first === undefined) throw new Error("no stored image");

  await expectServed(owner, instance, first);
});

test("a lazy image is stored and a generic video becomes a link and a video row that downloads nothing", async () => {
  const { instance, owner } = library;
  const item = await pasteArticle(owner, "lazy-video", LAZY_VIDEO_PAGE);
  const rows = imageRows(instance, item.id);

  expect(rows.length, "the lazy images of the article").toBeGreaterThanOrEqual(15);
  expect(rows.every(({ outcome }) => outcome === "stored")).toBe(true);
  expect(videoRows(instance, item.id)).toMatchObject([
    { source_url: LAZY_VIDEO, outcome: "linked", file_key: null, content_type: null, size: null },
  ]);
  expect(imageFiles(instance, item.id)).toEqual(storedKeys(rows));
  expect(item.postText).toContain(`](${LAZY_VIDEO}`);
  expect(item.postText).not.toMatch(/<\/?(?:video|source|iframe)\b/u);
});

test("a recognized embed becomes its watch-page link and a video row, and the image downloader never sees it", async () => {
  const { instance, owner } = library;
  const item = await pasteArticle(owner, "embed", EMBED_PAGE);

  expect(videoRows(instance, item.id)).toMatchObject([
    { source_url: EMBED_LINK, outcome: "linked", file_key: null },
  ]);
  expect(imageRows(instance, item.id).map(({ source_url }) => source_url)).not.toContain(
    EMBED_LINK,
  );
  expect(item.postText).toContain(`](${EMBED_LINK})`);
  expect(item.postText).not.toMatch(/!\[[^\]]*\]\(<?https:\/\/(?:www\.)?youtube/u);
});

test("an image over 2 MiB fails with too-large, the 20-image cap keeps the rest as source links, and videos are links", async () => {
  const { instance, owner } = library;
  const item = await pasteArticle(owner, "oversized", OVERSIZED_PAGE);
  const rows = imageRows(instance, item.id);
  const oversized = rows.find(({ source_url }) => source_url.includes(OVERSIZED_IMAGE));
  const large = rows.find(({ source_url }) => source_url.includes(LARGE_IMAGE));

  expect(rows, "the first 20 distinct images").toHaveLength(MAX_IMAGES);
  expect(oversized).toMatchObject({ outcome: "failed", reason: "too-large", file_key: null });
  expect(large).toMatchObject({ outcome: "stored" });
  expect(large?.size, "a 1 MB image is under the cap").toBeLessThanOrEqual(MAX_IMAGE_BYTES);
  expect(imageFiles(instance, item.id)).toEqual(storedKeys(rows));
  expect(routesIn(item.postText)).toHaveLength(MAX_IMAGES - 1);
  expect(item.postText, "an image past the cap keeps its source").toMatch(
    /!\[[^\]]*\]\(https:\/\/thumb\.wikimedia\.org\/[^)]*Mandel_zoom_06/u,
  );
  expect(videoRows(instance, item.id).length).toBeGreaterThan(0);
  expect(videoRows(instance, item.id).every(({ outcome }) => outcome === "linked")).toBe(true);
});

test("a repeated image is one row and one file, linked at every place the text shows it", async () => {
  const { instance, owner } = library;
  const item = await pasteArticle(owner, "repeated", REPEATED_PAGE);
  const rows = imageRows(instance, item.id);
  const kells = rows.find(({ source_url }) => source_url.includes(REPEATED_IMAGE));
  const places = routesIn(item.postText).filter((route) => route.endsWith(kells?.file_key ?? "-"));

  expect(rows.map(({ source_url }) => source_url)).toHaveLength(
    new Set(rows.map((r) => r.source_url)).size,
  );
  expect(places.length, "the repeated image in the text").toBeGreaterThanOrEqual(2);
  expect(imageFiles(instance, item.id)).toEqual(storedKeys(rows));
});

test("a failing image keeps its source as a link and the article still saves", async () => {
  const { instance, owner } = library;
  const item = await pasteArticle(owner, "failing", FAILING_PAGE);
  const rows = imageRows(instance, item.id);

  expect(rows).toHaveLength(FAILING_IMAGES);
  expect(rows.every((row) => row.outcome === "failed" && row.reason === "network")).toBe(true);
  expect(imageFiles(instance, item.id)).toEqual([]);

  for (const { source_url } of rows) expect(item.postText).toContain(`](${source_url}`);
});

test("an image the host answers 404 for fails with status while the page's other images, its video and its text are kept", async () => {
  const { instance, owner } = library;
  const item = await pasteArticle(owner, "mixed", MIXED_PAGE);
  const rows = imageRows(instance, item.id);
  const failed = rows.filter(({ outcome }) => outcome === "failed");

  expect(failed).toMatchObject([{ source_url: MIXED_FAILED_IMAGE, reason: "status" }]);
  expect(rows.filter(({ outcome }) => outcome === "stored").length).toBeGreaterThanOrEqual(8);
  expect(videoRows(instance, item.id)).toHaveLength(1);
  expect(item.postText).toContain(`](${MIXED_FAILED_IMAGE}`);
  expect(imageFiles(instance, item.id)).toEqual(storedKeys(rows));
});

test("an inline raster is decoded locally into a file and a row named by its digest, and no data address reaches the text", async () => {
  const { instance, owner } = library;
  const item = await pasteArticle(owner, "inline", INLINE_PAGE);
  const rows = imageRows(instance, item.id);
  const inline = rows.filter(({ source_url }) => source_url.startsWith("inline:sha256:"));

  expect(inline).toMatchObject([{ outcome: "stored", content_type: "image/png", final_url: null }]);
  expect(inline[0]?.source_url).toMatch(/^inline:sha256:[0-9a-f]{64}$/u);
  expect(rows.some(({ content_type }) => content_type === "image/avif")).toBe(true);

  for (const row of rows.filter(({ outcome }) => outcome === "stored")) {
    expectOwnBytes(row, instance.readFile(row.file_key ?? ""));
  }

  expect(item.postText).not.toMatch(/\(data:/iu);
  expect(postTextOf(instance, item.id).inline).not.toBeNull();
});
