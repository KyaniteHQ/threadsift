import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { MINUTE_MS } from "../src/core/contract/time-units.ts";
import { atClock } from "./clock-fixtures.ts";
import { keepEach, keepNote, pageOf } from "./highlights-page-fixtures.ts";
import { Instance } from "./instance.ts";
import { keepPassage, textHolding } from "./lost-highlight-fixtures.ts";
import { paste } from "./related-fixtures.ts";

const tokens = (length: number) =>
  Array.from({ length }, (_, at) => `token${String(at).padStart(2, "0")}`);

const idsOf = (entries: readonly { readonly kind: string; readonly id: number }[]) =>
  entries.map(({ kind, id }) => `${kind}:${String(id)}`);

describe("the Highlights page shows 50 entries at a time and pages by cursor without repeating or skipping an entry, also among entries of one date", () => {
  let instance: Instance;
  let itemId: number;
  const tied = Date.now() - MINUTE_MS;
  const passages = tokens(51);

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    itemId = await paste(instance, "many", {
      title: "Many passages",
      postText: textHolding(passages.join(" ")),
    });
    await atClock(
      () => tied,
      () => keepEach(instance, itemId, passages),
    );
    await keepNote(instance, tied, { itemId, body: "A Note of the same date", revision: 0 });
  });

  after(() => instance.close());

  it("answers a first page of 50 and a cursor, then the rest and no cursor, with the 52 entries of one date each once", async () => {
    const first = await pageOf(instance);

    assert.equal(first.entries.length, 50);
    assert.ok(first.next !== null);

    const second = await pageOf(instance, `?cursor=${first.next}`);

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
    assert.equal(first.counts.total, 52);
  });

  it("repeats none and skips none when a Highlight is kept between the two reads, and shows the new one first from the top", async () => {
    const first = await pageOf(instance);
    const cursor = first.next;

    assert.ok(cursor !== null);

    const listed = idsOf([
      ...first.entries,
      ...(await pageOf(instance, `?cursor=${cursor}`)).entries,
    ]);

    const added = await keepPassage(instance, itemId, "token05 token06");
    const second = await pageOf(instance, `?cursor=${cursor}`);

    assert.deepEqual(idsOf([...first.entries, ...second.entries]), listed);
    assert.equal((await pageOf(instance)).entries[0]?.id, added);
  });
});

describe("the Highlights page answers exactly 50 entries without a cursor, and the 51st on a second page", () => {
  let instance: Instance;
  let itemId: number;
  const fifty = tokens(50);
  const fiftyFirst = "token50";

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    itemId = await paste(instance, "fifty", {
      title: "Fifty passages",
      postText: textHolding([...fifty, fiftyFirst].join(" ")),
    });
    await keepEach(instance, itemId, fifty);
  });

  after(() => instance.close());

  it("answers 50 entries and no cursor when the library holds 50", async () => {
    const page = await pageOf(instance);

    assert.equal(page.entries.length, 50);
    assert.equal(page.next, null);
    assert.equal(page.counts.total, 50);
  });

  it("answers 50 entries and a cursor, then the 51st, when the library holds 51", async () => {
    const last = await keepPassage(instance, itemId, fiftyFirst);
    const first = await pageOf(instance);

    assert.equal(first.entries.length, 50);
    assert.ok(first.next !== null);

    const second = await pageOf(instance, `?cursor=${first.next}`);

    assert.equal(first.entries[0]?.id, last);
    assert.equal(second.entries.length, 1);
    assert.equal(second.next, null);
  });
});
