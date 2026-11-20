import { and, asc, eq, isNotNull, sql } from "drizzle-orm";

import type { Database } from "../kernel/database.ts";
import { itemTitle } from "../kernel/item-title.ts";
import {
  digests,
  githubRepos,
  itemTags,
  items,
  media,
  relatedItems,
  tags,
} from "../kernel/schema.ts";
import { sizedImageRows } from "../media/media-reads.ts";
import { threadReads } from "../thread/thread-read.ts";
import { highlightRows } from "./highlights.ts";
import { DETAIL_COLUMNS, selectItems } from "./item-selection.ts";
import { noteRows } from "./notes.ts";
import { REPOSITORY_COLUMNS } from "./repositories.ts";

function relatedRows(db: Database, itemId: number) {
  return db
    .select({
      id: items.id,
      title: itemTitle(),
      source: items.source,
      reason: relatedItems.reason,
    })
    .from(relatedItems)
    .innerJoin(items, eq(items.id, relatedItems.relatedId))
    .leftJoin(digests, eq(digests.itemId, items.id))
    .where(eq(relatedItems.itemId, itemId))
    .orderBy(asc(relatedItems.position));
}

function storedFileRows(db: Database, itemId: number) {
  return db
    .select({ key: media.fileKey, size: media.size })
    .from(media)
    .where(and(eq(media.itemId, itemId), eq(media.outcome, "stored"), isNotNull(media.fileKey)))
    .orderBy(asc(media.position));
}

function itemRead(db: Database, id: number) {
  return selectItems(db, {
    ...DETAIL_COLUMNS,
    topicId: items.topicId,
    revision: sql<number>`${items.generation}`.as("post_revision"),
  }).where(eq(items.id, id));
}

function readerReads(db: Database, id: number) {
  return [
    db.select({ digest: digests.digest }).from(digests).where(eq(digests.itemId, id)),
    db
      .select({ name: tags.name })
      .from(itemTags)
      .innerJoin(tags, eq(tags.id, itemTags.tagId))
      .where(eq(itemTags.itemId, id))
      .orderBy(asc(sql`${itemTags}.rowid`)),
    db.select(REPOSITORY_COLUMNS).from(githubRepos).where(eq(githubRepos.itemId, id)),
    ...threadReads(db, id),
    highlightRows(db, id),
    noteRows(db, id),
    sizedImageRows(db, id),
    relatedRows(db, id),
  ] as const;
}

export function detailReads(db: Database, id: number) {
  return db.batch([itemRead(db, id), ...readerReads(db, id)] as const);
}

export function planReads(db: Database, id: number) {
  return db.batch([itemRead(db, id), ...readerReads(db, id), storedFileRows(db, id)] as const);
}
