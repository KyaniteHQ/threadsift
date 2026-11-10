import { desc, eq, getTableColumns } from "drizzle-orm";

import { type ItemFilters, countQueries, filterCounts, itemConditions } from "./item-filters.ts";
import { JOINED_VIEW_COLUMNS } from "./joined-view.ts";
import type { Database } from "./ports.ts";
import { digests, githubRepos, items } from "./schema.ts";

export const EMPTY_JOINED_VIEW = {
  digestTitle: null,
  digestTopic: null,
  digestOutcome: "none",
  digestSource: false,
  stars: null,
  commentsKept: null,
  commentsTotal: null,
  waitReason: null,
  retryAt: null,
  imageKey: null,
  imageAlt: null,
  fillable: false,
} as const;

const {
  generation: _generation,
  digestFailed: _digestFailed,
  pendingDigest: _pendingDigest,
  topicId: _topicId,
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

export async function listItems(db: Database, filters: Readonly<ItemFilters>) {
  const [rows, ...counted] = await db.batch([
    listedItems(db).where(itemConditions(filters)).orderBy(desc(items.savedAt), desc(items.id)),
    ...countQueries(db, filters),
  ]);

  return { items: rows, counts: filterCounts(counted) };
}

export async function getListedItem(db: Database, id: number): Promise<ListedItemRow | undefined> {
  const [item] = await selectItems(db, LISTED_COLUMNS).where(eq(items.id, id));

  return item;
}
