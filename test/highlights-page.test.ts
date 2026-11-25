import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { SECOND_MS } from "../src/core/contract/time-units.ts";
import { keepAt, keepNote, countsOf, pageOf, entryLines } from "./highlights-page-fixtures.ts";
import { Instance } from "./instance.ts";
import { textHolding } from "./lost-highlight-fixtures.ts";
import { paste, REDDIT_THREAD } from "./related-fixtures.ts";

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

    assert.deepEqual(entryLines(page), [
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
    const cases: readonly (readonly [string, readonly string[]])[] = [
      [
        "?source=reddit",
        [`note:${String(thread)}:gamma pickles`, `highlight:${String(nothing)}:Nothing to see`],
      ],
      ["?topic=Cooking", [`highlight:${String(bilby)}:bilby passage`]],
      [
        "?tag=alpha",
        [`note:${String(alpha)}:alpha chickpeas`, `highlight:${String(quokka)}:quokka passage`],
      ],
      [
        "?source=article&tag=shared&topic=Reading",
        [`note:${String(alpha)}:alpha chickpeas`, `highlight:${String(quokka)}:quokka passage`],
      ],
      ["?source=github", []],
    ];
    const answers = await Promise.all(cases.map(([query]) => pageOf(instance, query)));

    assert.deepEqual(
      answers.map((answer) => entryLines(answer)),
      cases.map(([, expected]) => expected),
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
    const cases: readonly (readonly [string, readonly string[]])[] = [
      ["?q=chickpeas", [`note:${String(alpha)}:alpha chickpeas`]],
      ["?q=recipe", []],
      ["?q=shared", []],
      ["?q=bilby%20passage", [`highlight:${String(bilby)}:bilby passage`]],
      ["?q=bilby%20chickpeas", []],
      ["?q=alpha", [`note:${String(alpha)}:alpha chickpeas`]],
    ];
    const answers = await Promise.all(cases.map(([query]) => pageOf(instance, query)));

    assert.deepEqual(
      answers.map((answer) => entryLines(answer)),
      cases.map(([, expected]) => expected),
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

    assert.deepEqual(entryLines(await pageOf(instance)).slice(0, 2), [
      `note:${String(alpha)}:alpha chickpeas, saved again`,
      `note:${String(thread)}:gamma pickles`,
    ]);
  });
});
