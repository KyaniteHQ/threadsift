import { type SQL, and, desc, eq, sql } from "drizzle-orm";

import { type ItemCursor, formatCursor } from "../../../core/contract/item-cursor.ts";
import { PAGE_SIZE, pageTail } from "../../../core/contract/paging.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { DIGEST_SOURCE_COLUMNS, DIGEST_VIEW_COLUMNS } from "../../../core/kernel/digest-stored.ts";
import { STATUS_VIEW_COLUMNS } from "../../../core/kernel/item-status.ts";
import { WAIT_VIEW_COLUMNS } from "../../../core/kernel/job-waiting.ts";
import { digests, githubRepos, items } from "../../../core/kernel/schema.ts";
import { IMAGE_VIEW_COLUMNS } from "../../media/core/media-reads.ts";
import { COMMENT_COUNT_COLUMNS, FILLABLE_COLUMNS } from "../../thread/core/thread-store.ts";
import { type ItemFilters, countQueries, filterCounts, itemConditions } from "./item-filters.ts";

const VIEW_INPUT_COLUMNS = {
  ...DIGEST_SOURCE_COLUMNS,
  ...WAIT_VIEW_COLUMNS,
  ...COMMENT_COUNT_COLUMNS,
  ...IMAGE_VIEW_COLUMNS,
};

const ITEM_IDENTITY = {
  id: items.id,
  source: items.source,
  kind: items.kind,
  normalizedUrl: items.normalizedUrl,
  originalUrl: items.originalUrl,
  savedAt: items.savedAt,
  title: items.title,
  author: items.author,
  community: items.community,
};

const ITEM_FETCHED = {
  fetchedAt: items.fetchedAt,
  readState: items.readState,
  reason: items.reason,
  fetch: items.fetch,
  xNote: items.xNote,
};

export const LISTED_COLUMNS = { ...ITEM_IDENTITY, ...ITEM_FETCHED };

export const DETAIL_COLUMNS = {
  ...ITEM_IDENTITY,
  postText: items.postText,
  postTextKey: items.postTextKey,
  postedAt: items.postedAt,
  ...ITEM_FETCHED,
};

export function selectItems<Fields extends typeof LISTED_COLUMNS>(db: Database, fields: Fields) {
  return db
    .select({
      ...fields,
      ...STATUS_VIEW_COLUMNS,
      ...DIGEST_VIEW_COLUMNS,
      inputs: VIEW_INPUT_COLUMNS,
      ...FILLABLE_COLUMNS,
      stars: githubRepos.stars,
    })
    .from(items)
    .leftJoin(digests, eq(digests.itemId, items.id))
    .leftJoin(githubRepos, eq(githubRepos.itemId, items.id));
}

function listedItems(db: Database) {
  return selectItems(db, LISTED_COLUMNS);
}

export type ListedItemRow = Awaited<ReturnType<typeof listedItems>>[number];

export function itemRead(db: Database, at: SQL) {
  return listedItems(db).where(at);
}

export async function itemWhere(db: Database, at: SQL): Promise<ListedItemRow | undefined> {
  const [item] = await itemRead(db, at);

  return item;
}

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
    .limit(PAGE_SIZE + 1);
}

export async function listItems(
  db: Database,
  filters: Readonly<ItemFilters>,
  cursor: Readonly<ItemCursor> | null,
) {
  if (cursor !== null) {
    return {
      ...pageTail(await pageQuery(db, filters, cursor), PAGE_SIZE, formatCursor),
      counts: null,
    };
  }

  const [rows, ...counted] = await db.batch([
    pageQuery(db, filters, null),
    ...countQueries(db, filters),
  ]);

  return { ...pageTail(rows, PAGE_SIZE, formatCursor), counts: filterCounts(counted) };
}

export function getListedItem(db: Database, id: number): Promise<ListedItemRow | undefined> {
  return itemWhere(db, eq(items.id, id));
}
