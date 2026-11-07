import { desc, eq, getTableColumns, sql } from "drizzle-orm";

import { type ItemFilters, countQueries, filterCounts, itemConditions } from "./item-filters.ts";
import { hasOpenJob } from "./job-rows.ts";
import type { DIGEST_OUTCOMES } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { digests, items, topics } from "./schema.ts";

export const EMPTY_DIGEST_VIEW = {
  digestTitle: null,
  digestTopic: null,
  digestOutcome: "none",
} as const;

export const DIGEST_VIEW_COLUMNS = {
  digestTitle: sql<string | null>`${digests.title}`.as("digest_title"),
  digestTopic: sql<
    string | null
  >`coalesce((select ${topics.name} from ${topics} where ${topics.id} = ${items.topicId}), ${digests.topic})`.as(
    "digest_topic",
  ),
  digestOutcome: sql<
    (typeof DIGEST_OUTCOMES)[number]
  >`case when exists ${hasOpenJob("digest")} then 'pending' when ${items.digestFailed} then 'failed' else 'none' end`.as(
    "digest_outcome",
  ),
};

const {
  generation: _generation,
  digestFailed: _digestFailed,
  pendingDigest: _pendingDigest,
  topicId: _topicId,
  ...DETAIL_COLUMNS
} = getTableColumns(items);

const { postText: _postText, postedAt: _postedAt, ...LISTED_COLUMNS } = DETAIL_COLUMNS;

export { DETAIL_COLUMNS, LISTED_COLUMNS };

export function selectItems<Fields extends typeof LISTED_COLUMNS>(db: Database, fields: Fields) {
  return db
    .select({ ...fields, ...DIGEST_VIEW_COLUMNS })
    .from(items)
    .leftJoin(digests, eq(digests.itemId, items.id));
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

export async function getItem(db: Database, id: number) {
  const [item] = await selectItems(db, DETAIL_COLUMNS).where(eq(items.id, id));

  return item;
}

export async function getListedItem(db: Database, id: number): Promise<ListedItemRow | undefined> {
  const [item] = await selectItems(db, LISTED_COLUMNS).where(eq(items.id, id));

  return item;
}
