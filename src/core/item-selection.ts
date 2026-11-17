import { and, desc, eq, getTableColumns, sql } from "drizzle-orm";

import { type ItemFilters, countQueries, filterCounts, itemConditions } from "./item-filters.ts";
import { type ItemCursor, ITEMS_PAGE_SIZE, formatCursor } from "./item-page.ts";
import { JOINED_VIEW_COLUMNS } from "./joined-view.ts";
import type { Database } from "./ports.ts";
import { digests, githubRepos, items } from "./schema.ts";

const {
  generation: _generation,
  digestFailed: _digestFailed,
  pendingDigest: _pendingDigest,
  topicId: _topicId,
  addedByToken: _addedByToken,
  ...DETAIL_COLUMNS
} = getTableColumns(items);

const {
  postText: _postText,
  postTextKey: _postTextKey,
  postedAt: _postedAt,
  ...LISTED_COLUMNS
} = DETAIL_COLUMNS;

export { DETAIL_COLUMNS, LISTED_COLUMNS };

export function selectItems<Fields extends typeof LISTED_COLUMNS>(db: Database, fields: Fields) {
  return db
    .select({ ...fields, ...JOINED_VIEW_COLUMNS, stars: githubRepos.stars })
    .from(items)
    .leftJoin(digests, eq(digests.itemId, items.id))
    .leftJoin(githubRepos, eq(githubRepos.itemId, items.id));
}

function listedItems(db: Database) {
  return selectItems(db, LISTED_COLUMNS);
}

export type ListedItemRow = Awaited<ReturnType<typeof listedItems>>[number];

function pageQuery(
  db: Database,
  filters: Readonly<ItemFilters>,
  cursor: Readonly<ItemCursor> | null,
) {
  const after =
    cursor === null
      ? undefined
      : sql`(${items.savedAt}, ${items.id}) < (${cursor.savedAt}, ${cursor.id})`;

  return listedItems(db)
    .where(and(itemConditions(filters), after))
    .orderBy(desc(items.savedAt), desc(items.id))
    .limit(ITEMS_PAGE_SIZE + 1);
}

function pageOf(rows: readonly ListedItemRow[]) {
  const shown = rows.slice(0, ITEMS_PAGE_SIZE);
  const last = shown.at(-1);

  return {
    items: shown,
    next: rows.length > shown.length && last !== undefined ? formatCursor(last) : null,
  };
}

export async function listItems(
  db: Database,
  filters: Readonly<ItemFilters>,
  cursor: Readonly<ItemCursor> | null,
) {
  if (cursor !== null) {
    return { ...pageOf(await pageQuery(db, filters, cursor)), counts: null };
  }

  const [rows, ...counted] = await db.batch([
    pageQuery(db, filters, null),
    ...countQueries(db, filters),
  ]);

  return { ...pageOf(rows), counts: filterCounts(counted) };
}

export async function getListedItem(db: Database, id: number): Promise<ListedItemRow | undefined> {
  const [item] = await selectItems(db, LISTED_COLUMNS).where(eq(items.id, id));

  return item;
}
