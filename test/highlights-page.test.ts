import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import {
  keepAt,
  keepEach,
  keepNote,
  countsOf,
  pageOf,
  summary,
} from "./highlights-page-fixtures.ts";
import { Instance } from "./instance.ts";
import { keepPassage, textHolding } from "./lost-highlight-fixtures.ts";
import { exec, paste, REDDIT_THREAD } from "./related-fixtures.ts";

const PAGE_SIZE = 50;

const SECOND_MS = 1000;

describe("the Highlights page lists every Highlight and every Item Note newest first, with search and filters that read the entry's own text", () => {
  let instance: Instance;
  let alpha: number;
  let beta: number;
  let thread: number;
  let quokka: number;
  let bilby: number;
  let nothing: number;
  let start: number;

  const instantOf = (step: number) => start + step * SECOND_MS;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();

    alpha = await paste(instance, "alpha", {
      title: "Alpha guide",
      topic: "Reading",
      tags: ["alpha", "shared"],
      postText: textHolding("quokka passage"),
    });
    beta = await paste(instance, "beta", {
      title: "Beta recipe",
      topic: "Cooking",
      tags: ["beta", "shared"],
      postText: textHolding("bilby passage"),
    });
    thread = await paste(instance, "thread", {
      title: "A thread",
      topic: "Science",
      tags: ["gamma"],
      url: "https://www.reddit.com/r/science/comments/q1/a_thread/",
      content: JSON.stringify(REDDIT_THREAD),
      noDigest: false,
    });

    start = Date.now();
    quokka = await keepAt(instance, instantOf(1), alpha, "quokka passage");
    bilby = await keepAt(instance, instantOf(2), beta, "bilby passage");
    nothing = await keepAt(instance, instantOf(3), thread, "Nothing to see");

    await keepNote(instance, instantOf(4), { itemId: alpha, body: "alpha chickpeas", revision: 0 });

    const { note } = await keepNote(instance, instantOf(5), {
      itemId: beta,
      body: "cleared soon",
      revision: 0,
    });

    await keepNote(instance, instantOf(6), { itemId: beta, body: "   ", revision: note.revision });
    await keepNote(instance, instantOf(7), { itemId: thread, body: "gamma pickles", revision: 0 });
  });

  after(() => instance.close());

  it("lists each Highlight and each Note newest first with its Item's Source, title and saved date, and no entry for a cleared Note", async () => {
    const page = await pageOf(instance);

    assert.deepEqual(summary(page), [
      `note:${String(thread)}:gamma pickles`,
      `note:${String(alpha)}:alpha chickpeas`,
      `highlight:${String(nothing)}:Nothing to see`,
      `highlight:${String(bilby)}:bilby passage`,
      `highlight:${String(quokka)}:quokka passage`,
    ]);
    assert.equal(page.next, null);
    assert.equal(page.counts.total, 5);

    const items = await Promise.all([alpha, beta, thread].map((id) => instance.detail(id)));

    for (const { item } of page.entries) {
      const detail = items.find(({ id }) => id === item.id);

      assert.deepEqual(
        [item.id, item.source, item.savedAt],
        [detail?.id, detail?.source, detail?.savedAt],
      );
    }

    assert.deepEqual(
      page.entries.map(({ item }) => [item.source, item.title]),
      [
        ["reddit", "A thread"],
        ["article", "Alpha guide"],
        ["reddit", "A thread"],
        ["article", "Beta recipe"],
        ["article", "Alpha guide"],
      ],
    );
  });

  it("dates a Highlight when it was kept and a Note when it was last saved", async () => {
    const page = await pageOf(instance);

    assert.deepEqual(
      page.entries.map(({ kind, id, date }) => [kind, id, date]),
      [
        ["note", thread, instantOf(7)],
        ["note", alpha, instantOf(4)],
        ["highlight", nothing, instantOf(3)],
        ["highlight", bilby, instantOf(2)],
        ["highlight", quokka, instantOf(1)],
      ],
    );
  });

  it("filters by Source, Topic and Tag, alone and together", async () => {
    const answers = await Promise.all(
      [
        "?source=reddit",
        "?topic=Cooking",
        "?tag=alpha",
        "?source=article&tag=shared&topic=Reading",
        "?source=github",
      ].map((query) => pageOf(instance, query)),
    );

    assert.deepEqual(
      answers.map((answer) => summary(answer)),
      [
        [`note:${String(thread)}:gamma pickles`, `highlight:${String(nothing)}:Nothing to see`],
        [`highlight:${String(bilby)}:bilby passage`],
        [`note:${String(alpha)}:alpha chickpeas`, `highlight:${String(quokka)}:quokka passage`],
        [`note:${String(alpha)}:alpha chickpeas`, `highlight:${String(quokka)}:quokka passage`],
        [],
      ],
    );
  });

  it("keeps the library total under every filter and counts, for each choice, the entries it would leave given the other filters", async () => {
    const filtered = await pageOf(instance, "?topic=Science");

    assert.equal(filtered.counts.total, 5);
    assert.deepEqual(countsOf(filtered.counts.sources), {
      reddit: 2,
      x: 0,
      github: 0,
      article: 0,
      other: 0,
    });
    assert.deepEqual(countsOf(filtered.counts.topics), { reading: 2, cooking: 1, science: 2 });
    assert.deepEqual(countsOf(filtered.counts.tags), {
      alpha: 0,
      shared: 0,
      beta: 0,
      gamma: 2,
    });
  });

  it("matches a search only against the entry's own quote or Note text, with every word in the same entry", async () => {
    const answers = await Promise.all(
      [
        "?q=chickpeas",
        "?q=recipe",
        "?q=shared",
        "?q=bilby%20passage",
        "?q=bilby%20chickpeas",
        "?q=alpha",
      ].map((query) => pageOf(instance, query)),
    );

    assert.deepEqual(
      answers.map((answer) => summary(answer)),
      [
        [`note:${String(alpha)}:alpha chickpeas`],
        [],
        [],
        [`highlight:${String(bilby)}:bilby passage`],
        [],
        [`note:${String(alpha)}:alpha chickpeas`],
      ],
    );
  });

  it("counts under a search only the entries that match it", async () => {
    const searched = await pageOf(instance, "?q=chickpeas");

    assert.equal(searched.counts.total, 5);
    assert.deepEqual(countsOf(searched.counts.topics), { reading: 1, cooking: 0, science: 0 });
    assert.deepEqual(countsOf(searched.counts.sources), {
      reddit: 0,
      x: 0,
      github: 0,
      article: 1,
      other: 0,
    });
  });

  it("moves a Note that is saved again to the top", async () => {
    const { note } = await instance.detail(alpha);

    await keepNote(instance, instantOf(8), {
      itemId: alpha,
      body: "alpha chickpeas, saved again",
      revision: note.revision,
    });

    assert.deepEqual(summary(await pageOf(instance)).slice(0, 2), [
      `note:${String(alpha)}:alpha chickpeas, saved again`,
      `note:${String(thread)}:gamma pickles`,
    ]);
  });
});

describe("the Highlights page shows 50 entries at a time and pages by cursor without repeating or skipping an entry, also among entries of one date", () => {
  let instance: Instance;
  let itemId: number;
  let listed: readonly string[];
  const tied = Date.now() - 60_000;
  const passages = Array.from(
    { length: PAGE_SIZE + 1 },
    (_, at) => `token${String(at).padStart(2, "0")}`,
  );

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    itemId = await paste(instance, "many", {
      title: "Many passages",
      postText: textHolding(passages.join(" ")),
    });
    await keepEach(instance, itemId, passages);
    exec(instance, "update highlights set created_at = ?", tied);
    await keepNote(instance, tied, { itemId, body: "A Note of the same date", revision: 0 });
  });

  after(() => instance.close());

  it("answers a first page of 50 and a cursor, then the rest and no cursor, with the 52 entries of one date each once", async () => {
    const first = await pageOf(instance);

    assert.equal(first.entries.length, PAGE_SIZE);
    assert.notEqual(first.next, null);

    const second = await pageOf(instance, `?cursor=${first.next ?? ""}`);

    assert.equal(second.entries.length, 2);
    assert.equal(second.next, null);

    const all = [...first.entries, ...second.entries];

    assert.deepEqual(
      all.flatMap(({ kind, text }) => (kind === "highlight" ? [text] : [])).toSorted(),
      passages,
    );
    assert.deepEqual(
      all.flatMap(({ kind, text }) => (kind === "note" ? [text] : [])),
      ["A Note of the same date"],
    );
    assert.ok(all.every(({ date }) => date === tied));
    assert.equal(first.counts.total, PAGE_SIZE + 2);

    listed = all.map(({ kind, id }) => `${kind}:${String(id)}`);
  });

  it("repeats none and skips none when a Highlight is kept between the two reads, and shows the new one first from the top", async () => {
    const first = await pageOf(instance);
    const added = await keepPassage(instance, itemId, "token05 token06");
    const second = await pageOf(instance, `?cursor=${first.next ?? ""}`);

    assert.deepEqual(
      [...first.entries, ...second.entries].map(({ kind, id }) => `${kind}:${String(id)}`),
      listed,
    );
    assert.equal((await pageOf(instance)).entries[0]?.id, added);
  });
});
