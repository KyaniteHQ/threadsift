import { type SQL, type SQLWrapper, and, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/sqlite-core";

import {
  type Entry,
  type EntryKind,
  type PageCursor,
  formatCursor,
} from "../contract/highlights-page-contract.ts";
import type { Source } from "../contract/item-contract.ts";
import { PAGE_SIZE, pageTail } from "../contract/paging.ts";
import type { Database } from "../kernel/database.ts";
import { itemTitle } from "../kernel/item-title.ts";
import { digests, highlights, items, notes, searchParts } from "../kernel/schema.ts";
import { type ItemFilters, facetCounts, facetQueries, itemConditions } from "./item-filters.ts";
import { partMatching } from "./search.ts";

export interface HighlightsPage {
  readonly entries: readonly Entry[];
  readonly next: string | null;
  readonly counts: {
    readonly total: number;
  } & ReturnType<typeof facetCounts>;
}

function ownPart(terms: readonly string[], owner: Readonly<SQLWrapper>): SQL | undefined {
  return terms.length === 0
    ? undefined
    : sql`exists (select 1 from ${searchParts} where ${owner} and ${partMatching(terms)})`;
}

function highlightText(terms: readonly string[]): SQL | undefined {
  return ownPart(terms, sql`${searchParts.highlightId} = ${highlights.id}`);
}

function noteText(terms: readonly string[]): SQL | undefined {
  return ownPart(
    terms,
    sql`${searchParts.kind} = 'note' and ${searchParts.itemId} = ${notes.itemId}`,
  );
}

function entryUnit(terms: readonly string[]): SQL<number> {
  const ofHighlights = and(eq(highlights.itemId, items.id), highlightText(terms));
  const ofNotes = and(eq(notes.itemId, items.id), isNotNull(notes.body), noteText(terms));

  return sql<number>`coalesce(sum((select count(*) from ${highlights} where ${ofHighlights}) + (select count(*) from ${notes} where ${ofNotes})), 0)`;
}

function entryTotals(db: Database) {
  return [
    db.select({ count: count() }).from(highlights),
    db.select({ count: count() }).from(notes).where(isNotNull(notes.body)),
  ] as const;
}

const ITEM_COLUMNS = {
  itemId: sql<number>`${items.id}`.as("item_id"),
  source: sql<Source>`${items.source}`.as("source"),
  title: itemTitle().as("title"),
  savedAt: sql<number>`${items.savedAt}`.as("saved_at"),
};

function highlightArm(db: Database, filters: Readonly<ItemFilters>, facets: Readonly<ItemFilters>) {
  return db
    .select({
      kind: sql<EntryKind>`'highlight'`.as("kind"),
      id: sql<number>`${highlights.id}`.as("id"),
      text: sql<string>`${highlights.exact}`.as("text"),
      found: sql<number>`(${highlights.status} = 'attached')`.as("found"),
      date: sql<number>`${highlights.createdAt}`.as("date"),
      ...ITEM_COLUMNS,
    })
    .from(highlights)
    .innerJoin(items, eq(items.id, highlights.itemId))
    .leftJoin(digests, eq(digests.itemId, items.id))
    .where(and(itemConditions(facets), highlightText(filters.terms)));
}

function noteArm(db: Database, filters: Readonly<ItemFilters>, facets: Readonly<ItemFilters>) {
  return db
    .select({
      kind: sql<EntryKind>`'note'`.as("kind"),
      id: sql<number>`${notes.itemId}`.as("id"),
      text: sql<string>`${notes.body}`.as("text"),
      found: sql<number>`1`.as("found"),
      date: sql<number>`${notes.updatedAt}`.as("date"),
      ...ITEM_COLUMNS,
    })
    .from(notes)
    .innerJoin(items, eq(items.id, notes.itemId))
    .leftJoin(digests, eq(digests.itemId, items.id))
    .where(and(isNotNull(notes.body), itemConditions(facets), noteText(filters.terms)));
}

function pageQuery(db: Database, filters: Readonly<ItemFilters>, cursor: PageCursor | null) {
  const facets = { ...filters, terms: [] };

  const entries = unionAll(highlightArm(db, filters, facets), noteArm(db, filters, facets)).as(
    "entries",
  );

  const before =
    cursor === null
      ? undefined
      : sql`(${entries.date}, ${entries.kind}, ${entries.id}) < (${cursor.date}, ${cursor.kind}, ${cursor.id})`;

  return db
    .select()
    .from(entries)
    .where(before)
    .orderBy(desc(entries.date), desc(entries.kind), desc(entries.id))
    .limit(PAGE_SIZE + 1);
}

type Row = Awaited<ReturnType<typeof pageQuery>>[number];

function entryOf(row: Readonly<Row>): Entry {
  const item = { id: row.itemId, source: row.source, title: row.title, savedAt: row.savedAt };
  const shared = { id: row.id, text: row.text, date: row.date, item };

  return row.kind === "highlight"
    ? { kind: "highlight", ...shared, found: row.found === 1 }
    : { kind: "note", ...shared };
}

export async function highlightsPage(
  db: Database,
  filters: Readonly<ItemFilters>,
  cursor: PageCursor | null,
): Promise<HighlightsPage> {
  const facets = { ...filters, terms: [] };

  const [rows, [highlightTotal], [noteTotal], ...counted] = await db.batch([
    pageQuery(db, filters, cursor),
    ...entryTotals(db),
    ...facetQueries(db, facets, () => entryUnit(filters.terms)),
  ]);

  const { items: entries, next } = pageTail(
    rows.map((row) => entryOf(row)),
    PAGE_SIZE,
    formatCursor,
  );

  return {
    entries,
    next,
    counts: {
      total: (highlightTotal?.count ?? 0) + (noteTotal?.count ?? 0),
      ...facetCounts(counted),
    },
  };
}
