import { expect, test } from "@playwright/test";

import { postLink } from "./api.ts";
import { expectKeys, postTextOf } from "./files.ts";
import {
  FAILING_FETCH_PAGE,
  LAZY_VIDEO_PAGE,
  type Library,
  NO_IMAGE_PAGE,
  OTHER_PAGE,
  RELATIVE_BOOK,
  SMALL_PAGE,
  SMALL_PAGE_IMAGES,
  closeLibrary,
  openLibrary,
  pasteArticle,
  repoint,
} from "./media-pages.ts";
import {
  MAX_IMAGES,
  imageFiles,
  imageRows,
  mediaOf,
  routeOf,
  routesIn,
  storedKeys,
} from "./media.ts";
import { isContainerTarget } from "./target.ts";

test.describe.configure({ timeout: 300_000 });

let library: Library;

test.beforeEach(async () => {
  library = await openLibrary();
});

test.afterEach(async () => {
  await closeLibrary(library);
});

test("a refresh replaces the image set, a failed refresh keeps it, and a refresh with no images clears it", async () => {
  const { instance, owner } = library;
  const first = await pasteArticle(owner, "first", LAZY_VIDEO_PAGE);
  const firstKeys = imageFiles(instance, first.id);

  expect(firstKeys.length).toBeGreaterThanOrEqual(15);

  repoint(instance, first.id, SMALL_PAGE);

  const changed = await pasteArticle(owner, "changed", SMALL_PAGE);
  const changedRows = imageRows(instance, first.id);

  expect(changed.id, "a refresh of the same Item").toBe(first.id);
  expect(changedRows).toHaveLength(SMALL_PAGE_IMAGES);
  expect(mediaOf(instance, first.id).filter(({ kind }) => kind === "video")).toEqual([]);
  await expectKeys(
    instance,
    `items/${first.id}/img-`,
    storedKeys(changedRows),
    "the first set is gone and the second is stored",
  );
  expect(routesIn(changed.postText).toSorted()).toEqual(
    storedKeys(changedRows).map((key) => routeOf(key)),
  );

  repoint(instance, first.id, FAILING_FETCH_PAGE);

  const failed = (await postLink(owner, FAILING_FETCH_PAGE)).body.item;

  expect(failed).toMatchObject({ id: first.id, fetch: "status" });
  expect(imageRows(instance, first.id), "a failed refresh keeps the rows").toEqual(changedRows);
  await expectKeys(instance, `items/${first.id}/img-`, storedKeys(changedRows), "and the files");
  expect(failed.postText, "and the text").toBe(changed.postText);

  repoint(instance, first.id, NO_IMAGE_PAGE);

  const bare = await pasteArticle(owner, "bare", NO_IMAGE_PAGE);

  expect(bare.id).toBe(first.id);
  expect(mediaOf(instance, first.id), "a success with no images clears the rows").toEqual([]);
  await expectKeys(instance, `items/${first.id}/img-`, [], "and the files");
  expect(routesIn(bare.postText)).toEqual([]);
});

test("a refresh that keeps an image keeps its row and moves it to a new file, and the old address stops serving", async () => {
  const { instance, owner } = library;
  const first = await pasteArticle(owner, "first", SMALL_PAGE);
  const before = imageRows(instance, first.id);
  const second = await pasteArticle(owner, "second", SMALL_PAGE);
  const after = imageRows(instance, first.id);

  expect(second.id).toBe(first.id);
  expect(after.map(({ id, source_url }) => [id, source_url])).toEqual(
    before.map(({ id, source_url }) => [id, source_url]),
  );
  expect(storedKeys(after).filter((key) => storedKeys(before).includes(key))).toEqual([]);
  await expectKeys(
    instance,
    `items/${first.id}/img-`,
    storedKeys(after),
    "only the new attempt's files remain",
  );

  const [old] = before;
  const [kept] = after;

  expect((await owner.get(routeOf(old?.file_key ?? ""))).status()).toBe(404);
  expect((await owner.get(routeOf(kept?.file_key ?? ""))).status()).toBe(200);
});

test("an article that becomes Other loses its text, rows and files", async () => {
  const { instance, owner } = library;
  const first = await pasteArticle(owner, "first", SMALL_PAGE);

  expect(imageFiles(instance, first.id)).toHaveLength(SMALL_PAGE_IMAGES);
  repoint(instance, first.id, OTHER_PAGE);

  const other = (await postLink(owner, OTHER_PAGE)).body.item;

  expect(other).toMatchObject({ id: first.id, source: "other", fetch: "ok", postText: null });
  expect(mediaOf(instance, first.id)).toEqual([]);
  await expectKeys(instance, `items/${first.id}/`, []);
});

test("a file-backed post text links the stored images and a refresh to an inline text removes the old file and images", async () => {
  test.skip(
    !isContainerTarget(),
    "the Worker reads at most 900 KiB of HTML, so no text there reaches the file limit",
  );
  test.setTimeout(420_000);
  const { instance, owner } = library;
  const book = await pasteArticle(owner, "book", RELATIVE_BOOK);
  const rows = imageRows(instance, book.id);
  const named = postTextOf(instance, book.id);

  expect(rows, "the first 20 images of the book").toHaveLength(MAX_IMAGES);
  expect(rows.every(({ source_url }) => source_url.startsWith("https://www.gutenberg.org/"))).toBe(
    true,
  );
  expect(named.inline, "the text is in a file").toBeNull();

  const text = instance.readFile(named.key ?? "")?.toString("utf8") ?? "";

  expect(routesIn(text).toSorted()).toEqual(storedKeys(rows).map((key) => routeOf(key)));
  expect(text).not.toContain("](images/");

  repoint(instance, book.id, SMALL_PAGE);

  const small = await pasteArticle(owner, "small", SMALL_PAGE);

  expect(small.id).toBe(book.id);
  expect(postTextOf(instance, book.id)).toMatchObject({ key: null });
  await expectKeys(instance, `items/${book.id}/`, storedKeys(imageRows(instance, book.id)));
});
