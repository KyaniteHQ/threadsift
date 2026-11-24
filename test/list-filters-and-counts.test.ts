import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type Filters,
  chosenCount,
  isEmptyResult,
  isFiltered,
  isSearching,
  queryOf,
} from "../web/src/filters.ts";
import { matchedCount } from "../web/src/list-counts.ts";

const NONE: Filters = { q: "", source: null, read: null, topic: null, tag: null };

const requestOf = (query: string) => {
  const url = new URL(`/api/items${query}`, "http://threadsift.test");

  return { path: url.pathname, params: Object.fromEntries(url.searchParams) };
};

describe("the library's search and filters ask the Item list the way the HTTP interface reads them", () => {
  it("sends only the filters that are set, and the cursor of the page after", () => {
    assert.deepEqual(requestOf(queryOf(NONE)), { path: "/api/items", params: {} });
    assert.deepEqual(
      requestOf(
        queryOf({
          q: "online backup",
          source: "reddit",
          read: "unread",
          topic: "Databases",
          tag: null,
        }),
      ),
      {
        path: "/api/items",
        params: { q: "online backup", source: "reddit", read: "unread", topic: "Databases" },
      },
    );
    assert.deepEqual(requestOf(queryOf({ ...NONE, tag: "sqlite" }, "1700000000000.42")), {
      path: "/api/items",
      params: { tag: "sqlite", cursor: "1700000000000.42" },
    });
    assert.deepEqual(requestOf(queryOf(NONE, "1700000000000.42")), {
      path: "/api/items",
      params: { cursor: "1700000000000.42" },
    });
  });

  it("escapes the characters of a search that would end a query parameter", () => {
    assert.deepEqual(requestOf(queryOf({ ...NONE, q: "a&b=c #d" })), {
      path: "/api/items",
      params: { q: "a&b=c #d" },
    });
  });
});

describe("the library tells a search, a chosen filter and an empty result apart", () => {
  it("searches only when the text holds a run of letters or digits", () => {
    assert.equal(isSearching({ ...NONE, q: "" }), false);
    assert.equal(isSearching({ ...NONE, q: "  " }), false);
    assert.equal(isSearching({ ...NONE, q: "!? -" }), false);
    assert.equal(isSearching({ ...NONE, q: "sqlite" }), true);
    assert.equal(isSearching({ ...NONE, q: "ağaç" }), true);
    assert.equal(isSearching({ ...NONE, q: "42" }), true);
  });

  it("counts the chosen filters without the search", () => {
    assert.equal(chosenCount({ ...NONE, q: "sqlite" }), 0);
    assert.equal(chosenCount({ ...NONE, source: "x", topic: "Databases" }), 2);
    assert.equal(chosenCount({ q: "", source: "x", read: "read", topic: "t", tag: "g" }), 4);
  });

  it("counts a search or a chosen filter as filtering", () => {
    assert.equal(isFiltered(NONE), false);
    assert.equal(isFiltered({ ...NONE, q: "sqlite" }), true);
    assert.equal(isFiltered({ ...NONE, read: "unread" }), true);
  });

  it("calls a result empty only when no row is loaded and no page follows", () => {
    assert.equal(isEmptyResult(0, null), true);
    assert.equal(isEmptyResult(0, "1700000000000.42"), false);
    assert.equal(isEmptyResult(3, null), false);
  });
});

describe("the list head counts the Items that match the chosen Source", () => {
  const sources = [
    { key: "reddit", count: 3 },
    { key: "x", count: 2 },
    { key: "github", count: 0 },
  ] as const;

  it("adds every Source when none is chosen, and takes the count of the chosen one", () => {
    assert.equal(matchedCount({ sources }, { source: null }), 5);
    assert.equal(matchedCount({ sources }, { source: "x" }), 2);
    assert.equal(matchedCount({ sources }, { source: "github" }), 0);
    assert.equal(matchedCount({ sources }, { source: "article" }), 0);
  });
});
