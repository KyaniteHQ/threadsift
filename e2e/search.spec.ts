import { expect, test } from "@playwright/test";

import { SEARCH_LABEL, SEARCH_PLACEHOLDER } from "../web/src/text.ts";
import { newCode, newPassword } from "./access.ts";
import { itemOf, postLinkRaw, settled } from "./api.ts";
import { ESSAY, ESSAY_NORMALIZED, pasteGutenberg } from "./articles.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import {
  BOOK,
  BOOK_CUT_BYTES,
  BOOK_LATE_WORD,
  CHUNK_UNITS,
  checkIndex,
  digestOf,
  expectFinds,
  idAt,
  matches,
  matchesInOrder,
  partsOf,
  seedItem,
  sweptTo,
} from "./search.ts";

let screen: FreshScreen;

test.describe.configure({ timeout: 480_000 });

test.use({ trace: "off", video: "off", screenshot: "off" });

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
});

test.afterEach(async () => {
  await screen.close();
});

async function paste(url: string, digest: ReturnType<typeof digestOf>) {
  const { status, body } = await postLinkRaw(screen.context.request, url, digest);

  expect(status).toBeLessThan(300);

  return settled(screen.context.request, body.item.id, 180_000);
}

async function afterSweep(q: string, expected: readonly number[]): Promise<void> {
  await sweptTo(screen, q, expected);
}

async function pasteTrio() {
  const {
    last: { item: book },
  } = await pasteGutenberg(screen.context.request, {
    name: "pride-and-prejudice",
    url: BOOK,
    digest: digestOf("Quillfeather ledger", "Regency", "A marmalade summary."),
  });

  const essay = await paste(
    ESSAY,
    digestOf("Sawdust chronicle", "Workshop", "A tangerine summary."),
  );

  const palette = await paste(
    "https://stephango.com/flexoki",
    digestOf("Palette ledger", "Colour", "A persimmon summary."),
  );

  return { book, essay, palette };
}

function expectLateWordOnlyPastTheCut(postText: string): void {
  const early = Buffer.from(postText).subarray(0, BOOK_CUT_BYTES).toString().toLowerCase();

  expect(
    Buffer.byteLength(postText),
    "the stored post text is over the chunk size",
  ).toBeGreaterThan(BOOK_CUT_BYTES);

  expect(postText.toLowerCase()).toContain(BOOK_LATE_WORD);
  expect(early).not.toContain(BOOK_LATE_WORD);
}

test("search finds an Item by its title, Summary, Tag, a word past byte 500,000 and a partial word across parts, and reads typed syntax as plain words", async () => {
  const { request } = screen.context;
  const { book, essay, palette } = await pasteTrio();
  expectLateWordOnlyPastTheCut(book.postText ?? "");
  const all = [book.id, essay.id, palette.id];

  await expectFinds(request, [
    ["gutenberg", [book.id]],
    ["quillfeather", [book.id]],
    ["sawdust", [essay.id]],
    ["marmalade", [book.id]],
    ["tangerine", [essay.id]],
    ["regency", [book.id]],
    ["workshop", [essay.id]],
    ["ledger", [book.id, palette.id]],
    [BOOK_LATE_WORD, [book.id]],
    [BOOK_LATE_WORD.slice(0, 6), [book.id]],
    ["prejudice untinctured", [book.id]],
    ["quillfeather marmalade regency", [book.id]],
    ["marmalade tangerine", []],
    ["qzxjwv", []],
    ['"quillfeather', [book.id]],
    ["quillfeather AND marmalade", [book.id]],
    ["NEAR(quillfeather marmalade", [book.id]],
    ["quill*", [book.id]],
    ["sawdust-chronicle", [essay.id]],
    ["sawdust sawdust SAWDUST", [essay.id]],
    ["*", all],
    ['"', all],
  ]);

  expect(await matchesInOrder(request, "ledger")).toEqual([palette.id, book.id]);
});

test("the search field narrows the list to the Items that match every word and says when nothing matches", async () => {
  const { page } = screen;
  await paste(ESSAY, digestOf("Sawdust chronicle", "Workshop", "A tangerine summary."));

  await paste(
    "https://stephango.com/concise",
    digestOf("Palette ledger", "Colour", "A persimmon summary."),
  );

  await page.goto("/");
  const field = page.getByRole("searchbox", { name: SEARCH_LABEL });
  await expect(field).toHaveAttribute("placeholder", SEARCH_PLACEHOLDER);
  await expect(page.getByRole("article")).toHaveCount(2);

  await field.fill("tanger saw");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("link", { name: /Sawdust chronicle/u })).toBeVisible();
  await expect(field).toBeFocused();

  await field.fill("tangerine persimmon");
  await expect(page.getByText("No items match")).toBeVisible();
});

function seedStores() {
  const boundaryUrl = "https://example.com/boundary";

  seedItem(screen, {
    url: ESSAY_NORMALIZED,
    title: "Olderterm title",
    postText: "'olderterm body words'",
  });

  seedItem(screen, {
    url: boundaryUrl,
    title: "Edge title",
    postText: `replace(hex(zeroblob(24998)), '00', 'word ') || 'ab pivotalboundary ' || replace(hex(zeroblob(80000)), '00', 'word ')`,
  });

  return { seeded: idAt(screen, ESSAY_NORMALIZED), boundary: idAt(screen, boundaryUrl) };
}

async function expectWordKeptWhole(boundary: number): Promise<void> {
  const { request } = screen.context;

  await expectFinds(request, [
    ["pivotalboundary", [boundary]],
    ["pivotal", [boundary]],
    ["boundary", []],
    ["oundary", []],
  ]);

  const chunks = partsOf(screen, boundary).filter(({ kind }) => kind === "post-text");
  expect(chunks.length).toBeGreaterThan(3);

  for (const { length } of chunks) expect(length).toBeLessThanOrEqual(CHUNK_UNITS);
}

async function expectRefreshReplacesTerms(seeded: number): Promise<void> {
  const { request } = screen.context;
  const first = await paste(ESSAY, digestOf("Firstdigesttitle", "Oldtag", "Firstsummary text."));
  expect(first.id).toBe(seeded);
  expect(await matches(request, "olderterm")).toEqual([]);

  const fresh = ["fingers machine", "firstdigesttitle", "firstsummary", "oldtag"];

  await expectFinds(
    request,
    fresh.map((q) => [q, [seeded]] as const),
  );
  await paste(ESSAY, digestOf("Seconddigesttitle", "Newtag", "Secondsummary text."));

  await expectFinds(request, [
    ...["firstdigesttitle", "firstsummary", "oldtag"].map((q) => [q, []] as const),
    ...["seconddigesttitle", "secondsummary", "newtag"].map((q) => [q, [seeded]] as const),
  ]);
}

test("the index follows a refresh, a replaced Digest and an older Digest, and a sweep repairs rows changed behind the app", async () => {
  const { request } = screen.context;
  const { seeded, boundary } = seedStores();
  await afterSweep("olderterm", [seeded]);
  await expectWordKeptWhole(boundary);
  await expectRefreshReplacesTerms(seeded);

  screen.fresh.sql(
    `DELETE FROM search_parts WHERE item_id = ${seeded} AND kind = 'tags'; UPDATE items SET title = 'Repairedterm title', post_text = post_text || ' repairedbody' WHERE id = ${seeded}`,
  );

  await afterSweep("repairedterm repairedbody newtag", [seeded]);
  expect((await itemOf(request, seeded)).title).toBe("Repairedterm title");

  checkIndex(screen);
  screen.fresh.sql(`DELETE FROM items WHERE id = ${boundary}`);
  expect(partsOf(screen, boundary)).toEqual([]);
  expect(await matches(request, "pivotalboundary")).toEqual([]);
  checkIndex(screen);
});

test("a stored Digest that is not JSON leaves the Item's title, post text and Tags searchable", async () => {
  const { request } = screen.context;
  const item = await paste(ESSAY, digestOf("Damagedtitle", "Keptlink", "Damagedsummary text."));
  expect(await matches(request, "damagedsummary")).toEqual([item.id]);

  screen.fresh.sql(`UPDATE digests SET digest = 'not-json' WHERE item_id = ${item.id}`);
  await afterSweep("damagedsummary", []);

  await expectFinds(request, [
    ["damagedtitle", []],
    ["keptlink", [item.id]],
    ["fingers machine", [item.id]],
  ]);
});
