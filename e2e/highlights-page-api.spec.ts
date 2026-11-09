import { expect, test } from "@playwright/test";

import { anonymous } from "./access.ts";
import { agentHeaders } from "./catalog.ts";
import { screenForFile } from "./highlight-screen.ts";
import { type Library, buildLibrary, itemFacts, keepQuote, WORDS } from "./highlights-page-seed.ts";
import { pageAt, pageOf, summary, textsOf } from "./highlights-page.ts";
import { putPost } from "./highlights.ts";
import { saved } from "./notes.ts";
import { marker, run } from "./thread-fixtures.ts";

const screenOf = screenForFile();

let library: Library;

test.beforeAll(async () => {
  library = await buildLibrary(screenOf());
});

test("the page lists every Highlight and Note newest first with its Item's Source, title and saved date", async () => {
  const { request } = screenOf().context;
  const page = await pageOf(request);

  expect(page.entries).toEqual(
    await Promise.all(
      library.entries
        .toReversed()
        .map(async ({ kind, id, text, itemId, date }) =>
          kind === "highlight"
            ? { kind, id, text, date, found: true, item: await itemFacts(request, itemId) }
            : { kind, id, text, date, item: await itemFacts(request, itemId) },
        ),
    ),
  );

  expect(page.next, "six entries fit one page").toBeNull();

  expect(page.entries.map(({ item }) => [item.source, item.title])).toEqual([
    ["article", "Plain article"],
    ["reddit", "Essay craft"],
    ["reddit", "Notebook cache guide"],
    ["article", "Plain article"],
    ["reddit", "Essay craft"],
    ["reddit", "Notebook cache guide"],
  ]);
});

test("the counts give the library total and the entries each Source, Topic and Tag holds", async () => {
  const { counts } = await pageOf(screenOf().context.request);

  expect(counts).toEqual({
    total: 6,
    sources: [
      { key: "reddit", count: 4 },
      { key: "x", count: 0 },
      { key: "github", count: 0 },
      { key: "article", count: 2 },
      { key: "other", count: 0 },
    ],
    topics: [
      { key: "reading", name: "Reading", count: 4 },
      { key: "writing", name: "Writing", count: 2 },
    ],
    tags: [
      { key: "craft", name: "Craft", count: 4 },
      { key: "notebooks", name: "Notebooks", count: 2 },
    ],
  });
});

test("a word from a Highlight finds it and not a Note of the same Item without the word, and a word from a Note finds only the Note", async () => {
  const { request } = screenOf().context;
  const [desk, , , shelf] = library.entries;

  expect(desk?.itemId).toBe(shelf?.itemId);
  expect(textsOf(await pageOf(request, { q: WORDS.desk }))).toEqual([desk?.text]);
  expect(textsOf(await pageOf(request, { q: WORDS.shelf }))).toEqual([shelf?.text]);
  expect(textsOf(await pageOf(request, { q: WORDS.desk.slice(0, 12) })), "a prefix").toEqual([
    desk?.text,
  ]);

  expect(
    textsOf(await pageOf(request, { q: `${WORDS.desk} desk` })),
    "two words of one Highlight",
  ).toEqual([desk?.text]);

  expect(
    textsOf(await pageOf(request, { q: `${WORDS.desk} ${WORDS.shelf}` })),
    "one word from a Highlight and one from a Note of the same Item",
  ).toEqual([]);
});

test("the search reads only Highlights and Notes: an Item's title, Summary and Tags find nothing", async () => {
  const { request } = screenOf().context;

  for (const q of ["Notebook", "cache", "Craft", "thread"]) {
    expect(textsOf(await pageOf(request, { q })), q).toEqual([]);
  }
});

test("Source, Topic and Tag narrow the list the way they narrow the Library, and the counts follow the other filters", async () => {
  const { request } = screenOf().context;
  const everything = library.entries.toReversed().map(({ text }) => text);
  const of = (...kinds: readonly number[]) => kinds.map((at) => library.entries[at]?.text);

  expect(textsOf(await pageOf(request, { source: "article" }))).toEqual([
    library.entries[5]?.text,
    library.entries[2]?.text,
  ]);

  expect(textsOf(await pageOf(request, { source: "x" }))).toEqual([]);
  expect(textsOf(await pageOf(request, { topic: "Writing" }))).toEqual(of(4, 1));
  expect(textsOf(await pageOf(request, { topic: "  WRITING " })), "case and spacing").toEqual(
    of(4, 1),
  );

  expect(textsOf(await pageOf(request, { tag: "craft" }))).toEqual(of(5, 4, 2, 1));
  expect(textsOf(await pageOf(request, { topic: "Reading", tag: "Craft" }))).toEqual(of(5, 2));
  expect(textsOf(await pageOf(request, { source: "reddit", tag: "Craft" }))).toEqual(of(4, 1));
  expect(textsOf(await pageOf(request, { topic: "Unknown" }))).toEqual([]);
  expect(textsOf(await pageOf(request, { topic: "   " })), "a blank filter is none").toEqual(
    everything,
  );

  const narrowed = await pageOf(request, { tag: "Craft" });

  expect(narrowed.counts.total, "the library total ignores filters").toBe(6);
  expect(narrowed.counts.sources.map(({ count }) => count)).toEqual([2, 0, 0, 2, 0]);
  expect(narrowed.counts.topics.map(({ count }) => count)).toEqual([2, 2]);
  expect(
    narrowed.counts.tags.map(({ count }) => count),
    "a group ignores its own filter",
  ).toEqual([4, 2]);

  const searched = await pageOf(request, { q: WORDS.wide });
  expect(searched.counts.sources.map(({ count }) => count)).toEqual([0, 0, 0, 1, 0]);
  expect(searched.counts.topics.map(({ count }) => count)).toEqual([1, 0]);
});

test("a cleared Note is gone, and a Highlight whose passage a refresh removed shows as not found", async () => {
  const { request } = screenOf().context;
  const id = `pg${run}`;
  const word = marker("cleared");
  const kept = marker("kept");
  const text = `Text with ${word} and ${kept} in it.`;
  const itemId = await putPost(request, id, text);

  const highlight = await keepQuote(screenOf(), itemId, text, kept);
  await saved(request, itemId, `Note ${word}`, 0);

  expect(textsOf(await pageOf(request, { q: word }))).toEqual([`Note ${word}`]);
  expect(textsOf(await pageOf(request, { q: kept }))).toEqual([kept]);

  await saved(request, itemId, "  ", 1);
  expect(textsOf(await pageOf(request, { q: word }))).toEqual([]);
  expect(textsOf(await pageOf(request, { q: kept })), "the Highlight stays").toEqual([kept]);

  await putPost(request, id, "A refreshed text that drops the passage.");

  const [gone] = (await pageOf(request, { q: kept })).entries;

  expect(gone).toMatchObject({ kind: "highlight", id: highlight, text: kept, found: false });
});

test("an agent token reads the page, a request with no sign-in is refused, and bad parameters answer 400", async () => {
  const { request } = screenOf().context;
  const token = await agentHeaders(screenOf());
  const { status, response } = await pageAt(request, {}, token);

  expect(status).toBe(200);
  expect(summary(await pageOf(request, {}, token))).toEqual(summary(await pageOf(request)));
  expect(response.headers()["content-type"]).toContain("application/json");

  const stranger = await anonymous(screenOf().fresh.url);

  try {
    expect((await pageAt(stranger)).status, "no session and no token").toBe(401);
  } finally {
    await stranger.dispose();
  }

  for (const params of [
    { source: "tumblr" },
    { q: "x".repeat(201) },
    { cursor: "soon" },
    { cursor: "1.thing.2" },
    { cursor: "1.highlight" },
  ]) {
    const refused = await pageAt(request, params);

    expect(refused.status, JSON.stringify(params)).toBe(400);
  }
});
