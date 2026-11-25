import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { FilterCounts } from "../src/core/contract/filter-counts-contract.ts";
import { type Item, ItemSchema } from "../src/core/contract/item-wire.ts";
import {
  type ListState,
  type Ready,
  appended,
  loaded,
  withKnown,
  withMore,
  withRead,
  withoutItem,
} from "../web/src/list-state.ts";

const itemOf = (id: number, savedAt: number): Item =>
  ItemSchema.parse({
    id,
    source: "reddit",
    kind: "reddit-post",
    normalizedUrl: `https://example.com/${String(id)}`,
    originalUrl: `https://example.com/${String(id)}`,
    savedAt,
    title: `Item ${String(id)}`,
    digestTitle: null,
    digestTopic: null,
    digestOutcome: "none",
    author: null,
    community: null,
    fetchedAt: null,
    fetch: null,
    xNote: null,
    readState: "unread",
    stars: null,
    commentCount: null,
    wait: null,
    image: null,
    fillable: false,
    status: "ready",
    reason: null,
    retry: null,
  });

const FIVE = itemOf(5, 500);

const FOUR = itemOf(4, 400);

const COUNTS: FilterCounts = {
  total: 3,
  unread: 2,
  sources: [
    { key: "reddit", count: 2 },
    { key: "x", count: 1 },
  ],
  reads: [
    { key: "unread", count: 2 },
    { key: "read", count: 1 },
  ],
  topics: [],
  tags: [],
};

const ready = (items: readonly Item[], next: string | null, query = ""): Ready => ({
  status: "ready",
  known: items,
  items,
  counts: COUNTS,
  loadedAt: 0,
  query,
  next,
  more: "idle",
});

function readyOf(list: Readonly<ListState>): Readonly<Ready> {
  if (list.status !== "ready") assert.fail(`the list is ${list.status}`);

  return list;
}

const idsOf = (list: Readonly<ListState>): readonly number[] =>
  readyOf(list).items.map(({ id }) => id);

const moreOf = (list: Readonly<ListState>) => readyOf(list).more;

const placing = (list: Ready, item: Item): ListState =>
  withRead(withKnown(list, item), { ...item, readState: "read" }, true);

const reading = (list: Ready, unfiltered: boolean): ListState =>
  withRead(list, { ...FIVE, readState: "read" }, unfiltered);

const page = (items: readonly Item[], next: string | null) => ({ items, next });

describe("a read-state change places an Item that the list holds only apart, by its saved date and id", () => {
  it("puts it between the rows it sorts between", () => {
    assert.deepEqual(idsOf(placing(ready([FIVE, FOUR], null), itemOf(9, 450))), [5, 9, 4]);
  });

  it("puts it before a row saved in the same millisecond when its id is higher", () => {
    assert.deepEqual(idsOf(placing(ready([FIVE, FOUR], null), itemOf(7, 500))), [7, 5, 4]);
  });

  it("puts it after a row saved in the same millisecond when its id is lower", () => {
    assert.deepEqual(idsOf(placing(ready([FIVE, FOUR], null), itemOf(3, 400))), [5, 4, 3]);
  });

  it("puts an Item older than every row last when no page follows", () => {
    assert.deepEqual(idsOf(placing(ready([FIVE, FOUR], null), itemOf(1, 100))), [5, 4, 1]);
  });

  it("leaves an Item older than the last row out when a page that holds it is not read yet", () => {
    assert.deepEqual(idsOf(placing(ready([FIVE, FOUR], "400.4"), itemOf(1, 100))), [5, 4]);
  });

  it("still places an Item newer than the last row when a page follows", () => {
    assert.deepEqual(idsOf(placing(ready([FIVE, FOUR], "400.4"), itemOf(9, 450))), [5, 9, 4]);
  });
});

describe("a read-state change keeps the rows and the counts true", () => {
  it("replaces a listed Item in its place", () => {
    const list = reading(ready([FIVE, FOUR], null), true);

    assert.deepEqual(idsOf(list), [5, 4]);
    assert.equal(readyOf(list).items[0]?.readState, "read");
  });

  it("moves the unread and read counts of an unfiltered list", () => {
    const list = reading(ready([FIVE, FOUR], null), true);

    assert.equal(readyOf(list).counts.unread, 1);
    assert.deepEqual(readyOf(list).counts.reads, [
      { key: "unread", count: 1 },
      { key: "read", count: 2 },
    ]);
  });

  it("leaves the counts of a filtered list to the next read, because the server counts them", () => {
    const list = reading(ready([FIVE, FOUR], null), false);

    assert.deepEqual(readyOf(list).counts, COUNTS);
  });

  it("changes nothing for an Item the list does not know or for an answer equal to what it holds", () => {
    const list = ready([FIVE, FOUR], null);

    assert.equal(withRead(list, itemOf(8, 800), true), list);
    assert.equal(withRead(list, FIVE, true), list);
  });
});

describe("the pages the browser reads join the list without repeating or skipping a row", () => {
  it("appends the next page, skips a row it already holds, and takes the new cursor", () => {
    const list = ready([FIVE, FOUR], "400.4", "?q=a");
    const next = appended(list, page([FOUR, itemOf(3, 300)], null), {
      query: "?q=a",
      cursor: "400.4",
    });

    assert.deepEqual(idsOf(next), [5, 4, 3]);
    assert.equal(readyOf(next).next, null);
  });

  it("drops a page that was read for another query or another cursor", () => {
    const list = ready([FIVE, FOUR], "400.4", "?q=a");

    assert.equal(
      appended(list, page([itemOf(3, 300)], null), { query: "?q=b", cursor: "400.4" }),
      list,
    );
    assert.equal(
      appended(list, page([itemOf(3, 300)], null), { query: "?q=a", cursor: "300.3" }),
      list,
    );
  });

  it("applies a failed or loading state of a page read only to the page it was for", () => {
    const list = ready([FIVE, FOUR], "400.4", "?q=a");

    assert.equal(moreOf(withMore(list, "?q=a", "400.4", "failed")), "failed");
    assert.equal(moreOf(withMore(list, "?q=a", "400.4", "loading")), "loading");
    assert.equal(withMore(list, "?q=b", "400.4", "failed"), list);
    assert.equal(withMore(list, "?q=a", "300.3", "loading"), list);
  });

  it("replaces the rows of a reload by Item id and keeps the Items it holds apart", () => {
    const apart = itemOf(9, 450);
    const before = withKnown(ready([FIVE, FOUR], null), apart);
    const edited = { ...FIVE, title: "Item 5, renamed" };
    const after = loaded(before, { items: [edited], counts: COUNTS, next: null, query: "?q=a" });

    assert.deepEqual(idsOf(after), [5]);
    assert.deepEqual(
      after.known
        .map(({ id, title }) => [id, title])
        .toSorted(([left], [right]) => Number(left) - Number(right)),
      [
        [4, "Item 4"],
        [5, "Item 5, renamed"],
        [9, "Item 9"],
      ],
    );
    assert.equal(readyOf(after).query, "?q=a");
  });
});

describe("deleting an Item takes it out of the rows and of the Items the list knows", () => {
  it("removes it from both at once", () => {
    const list = withoutItem(ready([FIVE, FOUR], null), 5);

    assert.deepEqual(idsOf(list), [4]);
    assert.deepEqual(
      list.known.map(({ id }) => id),
      [4],
    );
  });
});
