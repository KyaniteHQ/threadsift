import type { Library, Tallies } from "./filters.ts";

const NO_TOPICS = { reading: 0, writing: 0, tools: 0, notes: 0, archive: 0, misc: 0 } as const;
const ONE_EACH = { reading: 1, writing: 1, tools: 1, notes: 1, archive: 1, misc: 1 } as const;
const NO_SOURCES = { reddit: 0, x: 0, github: 0, article: 0, other: 0 } as const;

export interface FilterCase {
  readonly params: Readonly<Record<string, string>>;
  readonly ids: readonly number[];
  readonly counts: Partial<Tallies>;
}

function unfilteredCases({ articles, linkOnly }: Readonly<Library>): readonly FilterCase[] {
  const [a0 = 0, a1 = 0] = articles;

  return [
    {
      params: {},
      ids: [...articles, ...Object.values(linkOnly)],
      counts: {
        total: 11,
        unread: 8,
        sources: { reddit: 1, x: 1, github: 1, article: 7, other: 1 },
        reads: { unread: 8, read: 3 },
        topics: { ...ONE_EACH, reading: 2 },
        tags: { essays: 4, craft: 3 },
      },
    },
    {
      params: { topic: "  READING " },
      ids: [a0, a1],
      counts: {
        total: 11,
        unread: 8,
        sources: { ...NO_SOURCES, article: 2 },
        reads: { unread: 1, read: 1 },
        topics: { ...ONE_EACH, reading: 2 },
        tags: { essays: 2, craft: 1 },
      },
    },
  ];
}

function combinedCases({ articles, linkOnly }: Readonly<Library>): readonly FilterCase[] {
  const [a0 = 0, a1 = 0, a2 = 0, a3 = 0, a4 = 0, a5 = 0, a6 = 0] = articles;

  return [
    {
      params: { tag: "craft", read: "read" },
      ids: [a0, a2],
      counts: {
        sources: { ...NO_SOURCES, article: 2 },
        reads: { unread: 1, read: 2 },
        topics: { ...NO_TOPICS, reading: 1, writing: 1 },
        tags: { essays: 1, craft: 2 },
      },
    },
    {
      params: { source: "github" },
      ids: [linkOnly.github],
      counts: {
        reads: { unread: 0, read: 1 },
        topics: NO_TOPICS,
        tags: { essays: 0, craft: 0 },
      },
    },
    {
      params: { q: "essay", source: "article", read: "unread" },
      ids: [a1, a3, a4, a5, a6],
      counts: { reads: { unread: 5, read: 2 } },
    },
    { params: { topic: "nope" }, ids: [], counts: { total: 11, unread: 8 } },
  ];
}

function normalizedCases({ articles }: Readonly<Library>): readonly FilterCase[] {
  const [a0 = 0, a1 = 0, a2 = 0, , , a5 = 0] = articles;

  return [
    {
      params: { tag: "  CrAfT " },
      ids: [a0, a2, a5],
      counts: {
        sources: { ...NO_SOURCES, article: 3 },
        reads: { unread: 1, read: 2 },
        topics: { ...NO_TOPICS, reading: 1, writing: 1, archive: 1 },
        tags: { essays: 4, craft: 3 },
      },
    },
    {
      params: {
        q: "essay",
        source: "article",
        read: "unread",
        topic: " READING ",
        tag: "  Essays",
      },
      ids: [a1],
      counts: {
        total: 11,
        unread: 8,
        sources: { ...NO_SOURCES, article: 1 },
        reads: { unread: 1, read: 1 },
        topics: { ...NO_TOPICS, reading: 1, tools: 1, misc: 1 },
        tags: { essays: 1, craft: 0 },
      },
    },
  ];
}

export function filterCases(library: Readonly<Library>): readonly FilterCase[] {
  return [...unfilteredCases(library), ...combinedCases(library), ...normalizedCases(library)];
}
