import { type SQL, and, asc, count, desc, eq, isNotNull, sql } from "drizzle-orm";

import { catalogKey } from "./catalog-key.ts";
import type { ReadState, Source } from "./kinds.ts";
import { READ_STATES, SOURCES } from "./kinds.ts";
import { parseLink } from "./links.ts";
import type { Database } from "./ports.ts";
import { itemTags, items, tags, topics } from "./schema.ts";
import { searchTerms } from "./search-terms.ts";
import { matching } from "./search.ts";

export interface ItemFilters {
  readonly terms: readonly string[];
  readonly source: Source | undefined;
  readonly read: ReadState | undefined;
  readonly topic: string | undefined;
  readonly tag: string | undefined;
  readonly normalizedUrl: string | undefined;
}

export interface TypedFilters {
  readonly q?: string | undefined;
  readonly source?: Source | undefined;
  readonly read?: ReadState | undefined;
  readonly topic?: string | undefined;
  readonly tag?: string | undefined;
  readonly url?: string | undefined;
}

export interface CountedName {
  readonly key: string;
  readonly name: string;
  readonly count: number;
}

export interface FilterCounts {
  readonly total: number;
  readonly unread: number;
  readonly sources: readonly { readonly key: Source; readonly count: number }[];
  readonly reads: readonly { readonly key: ReadState; readonly count: number }[];
  readonly topics: readonly CountedName[];
  readonly tags: readonly CountedName[];
}

type Facet = "source" | "read" | "topic" | "tag";

function keyOf(typed: string | undefined): string | undefined {
  const key = typed === undefined ? "" : catalogKey(typed);

  return key === "" ? undefined : key;
}

export function itemFilters(typed: Readonly<TypedFilters>): ItemFilters {
  return {
    terms: searchTerms(typed.q ?? ""),
    source: typed.source,
    read: typed.read,
    topic: keyOf(typed.topic),
    tag: keyOf(typed.tag),
    normalizedUrl: typed.url === undefined ? undefined : parseLink(typed.url).normalizedUrl,
  };
}

function facetConditions(filters: Readonly<ItemFilters>): Readonly<Record<Facet, SQL | undefined>> {
  const { source, read, topic, tag } = filters;

  return {
    source: source === undefined ? undefined : eq(items.source, source),
    read: read === undefined ? undefined : eq(items.readState, read),
    topic:
      topic === undefined
        ? undefined
        : sql`${items.topicId} in (select ${topics.id} from ${topics} where ${topics.key} = ${topic})`,
    tag:
      tag === undefined
        ? undefined
        : sql`${items.id} in (select ${itemTags.itemId} from ${itemTags} join ${tags} on ${tags.id} = ${itemTags.tagId} where ${tags.key} = ${tag})`,
  };
}

export function itemConditions(filters: Readonly<ItemFilters>, skipping?: Facet): SQL | undefined {
  const chosen = Object.entries(facetConditions(filters))
    .filter(([facet]) => facet !== skipping)
    .map(([, condition]) => condition);

  return and(
    filters.terms.length === 0 ? undefined : matching(filters.terms),
    filters.normalizedUrl === undefined
      ? undefined
      : eq(items.normalizedUrl, filters.normalizedUrl),
    ...chosen,
  );
}

export type Unit = () => SQL<number>;

function keyCounts<Column extends typeof items.source | typeof items.readState>(
  db: Database,
  filters: Readonly<ItemFilters>,
  facet: "source" | "read",
  column: Column,
  unit: Unit,
) {
  return db
    .select({ key: column, count: unit() })
    .from(items)
    .where(itemConditions(filters, facet))
    .groupBy(column);
}

function topicCounts(db: Database, filters: Readonly<ItemFilters>, unit: Unit) {
  return db
    .select({ id: items.topicId, count: unit() })
    .from(items)
    .where(and(isNotNull(items.topicId), itemConditions(filters, "topic")))
    .groupBy(items.topicId);
}

function tagCounts(db: Database, filters: Readonly<ItemFilters>, unit: Unit) {
  return db
    .select({ id: itemTags.tagId, count: unit() })
    .from(itemTags)
    .innerJoin(items, eq(items.id, itemTags.itemId))
    .where(itemConditions(filters, "tag"))
    .groupBy(itemTags.tagId);
}

function catalogRows(db: Database, facet: "topic" | "tag") {
  const table = facet === "topic" ? topics : tags;

  const uses =
    facet === "topic"
      ? sql`(select count(*) from ${items} where ${items.topicId} = ${topics.id})`
      : sql`(select count(*) from ${itemTags} where ${itemTags.tagId} = ${tags.id})`;

  return db
    .select({ id: table.id, key: table.key, name: table.name })
    .from(table)
    .orderBy(desc(uses), asc(table.id));
}

function totals(db: Database) {
  return db
    .select({
      total: count(),
      unread: sql<number>`coalesce(sum(${items.readState} = 'unread'), 0)`,
    })
    .from(items);
}

export function facetQueries(db: Database, filters: Readonly<ItemFilters>, unit: Unit) {
  return [
    keyCounts(db, filters, "source", items.source, unit),
    catalogRows(db, "topic"),
    topicCounts(db, filters, unit),
    catalogRows(db, "tag"),
    tagCounts(db, filters, unit),
  ] as const;
}

export function countQueries(db: Database, filters: Readonly<ItemFilters>) {
  const [sources, topicList, topicCounted, tagList, tagCounted] = facetQueries(db, filters, count);

  return [
    totals(db),
    sources,
    keyCounts(db, filters, "read", items.readState, count),
    topicList,
    topicCounted,
    tagList,
    tagCounted,
  ] as const;
}

interface Totals {
  readonly total: number;
  readonly unread: number;
}

interface KeyCount<Key extends string> {
  readonly key: Key;
  readonly count: number;
}

interface IdCount {
  readonly id: number | null;
  readonly count: number;
}

interface IdName {
  readonly id: number;
  readonly key: string;
  readonly name: string;
}

type CountResults = readonly [
  readonly Totals[],
  readonly KeyCount<Source>[],
  readonly KeyCount<ReadState>[],
  readonly IdName[],
  readonly IdCount[],
  readonly IdName[],
  readonly IdCount[],
];

function named(rows: readonly IdName[], counted: readonly IdCount[]): readonly CountedName[] {
  const byId = new Map(counted.map((row) => [row.id, row.count]));

  return rows.map(({ id, key, name }) => ({ key, name, count: byId.get(id) ?? 0 }));
}

function tally<Key extends string>(
  keys: readonly Key[],
  rows: readonly KeyCount<Key>[],
): readonly KeyCount<Key>[] {
  const byKey = new Map(rows.map((row) => [row.key, row.count]));

  return keys.map((key) => ({ key, count: byKey.get(key) ?? 0 }));
}

export type FacetResults = readonly [
  readonly KeyCount<Source>[],
  readonly IdName[],
  readonly IdCount[],
  readonly IdName[],
  readonly IdCount[],
];

export function facetCounts([sources, topicList, topicCounted, tagList, tagCounted]: FacetResults) {
  return {
    sources: tally(SOURCES, sources),
    topics: named(topicList, topicCounted),
    tags: named(tagList, tagCounted),
  };
}

export function filterCounts([
  [library],
  sources,
  reads,
  topicList,
  topicCounted,
  tagList,
  tagCounted,
]: CountResults): FilterCounts {
  return {
    total: library?.total ?? 0,
    unread: library?.unread ?? 0,
    reads: tally(READ_STATES, reads),
    ...facetCounts([sources, topicList, topicCounted, tagList, tagCounted]),
  };
}
