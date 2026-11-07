import { asc, desc, eq, getTableColumns, sql } from "drizzle-orm";

import { type ReaderDigest, parseStoredDigest } from "./ai-contract.ts";
import { DIGEST_VIEW_COLUMNS } from "./digest-view.ts";
import { type ItemFilters, countQueries, filterCounts, itemConditions } from "./item-filters.ts";
import type { Database, Ports } from "./ports.ts";
import { readPostText } from "./post-text.ts";
import { commentsOf, threadReads } from "./reddit-thread.ts";
import { REPOSITORY_COLUMNS } from "./repositories.ts";
import { digests, githubRepos, itemTags, items, tags } from "./schema.ts";

export const EMPTY_JOINED_VIEW = {
  digestTitle: null,
  digestTopic: null,
  digestOutcome: "none",
  digestSource: false,
  stars: null,
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
    .select({ ...fields, ...DIGEST_VIEW_COLUMNS, stars: githubRepos.stars })
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

function readerDigest(
  id: number,
  stored: string | undefined,
  tagNames: readonly string[],
): ReaderDigest | null {
  if (stored === undefined) return null;

  try {
    const { summary, keyPoints } = parseStoredDigest(stored);

    return { summary, keyPoints, tags: tagNames };
  } catch (error) {
    console.error(`Digest of Item ${id} is not readable`, error);

    return null;
  }
}

export async function getItem({ db, files }: Readonly<Pick<Ports, "db" | "files">>, id: number) {
  const [[row], [stored], tagRows, [repository], threadRows, threadReport] = await db.batch([
    selectItems(db, DETAIL_COLUMNS).where(eq(items.id, id)),
    db.select({ digest: digests.digest }).from(digests).where(eq(digests.itemId, id)),
    db
      .select({ name: tags.name })
      .from(itemTags)
      .innerJoin(tags, eq(tags.id, itemTags.tagId))
      .where(eq(itemTags.itemId, id))
      .orderBy(asc(sql`${itemTags}.rowid`)),
    db.select(REPOSITORY_COLUMNS).from(githubRepos).where(eq(githubRepos.itemId, id)),
    ...threadReads(db, id),
  ]);

  if (row === undefined) {
    return row;
  }

  const { postTextKey, ...item } = row;

  return {
    ...item,
    postText: postTextKey === null ? item.postText : await readPostText(files, id, postTextKey),
    digest: readerDigest(
      id,
      stored?.digest,
      tagRows.map((tag) => tag.name),
    ),
    repository: repository ?? null,
    comments: commentsOf(threadRows, threadReport),
  };
}

export async function getListedItem(db: Database, id: number): Promise<ListedItemRow | undefined> {
  const [item] = await selectItems(db, LISTED_COLUMNS).where(eq(items.id, id));

  return item;
}
