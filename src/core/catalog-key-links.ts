import { type SQLWrapper, and, asc, eq, notExists, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { alias } from "drizzle-orm/sqlite-core";

import type { Database } from "./ports.ts";
import { itemTags, items, tags, topics } from "./schema.ts";
import { tagPartWrites } from "./search.ts";

export const MERGE_ITEMS = 500;

export interface CatalogKind {
  readonly step: string;
  readonly table: typeof topics | typeof tags;
  readonly linked: (db: Database, id: number) => Promise<readonly number[]>;
  readonly relink: (
    db: Database,
    loser: number,
    survivor: number,
    itemIds: readonly number[],
  ) => readonly BatchItem<"sqlite">[];
  readonly unlinked: (db: Database, id: number) => ReturnType<typeof notExists>;
}

function among(column: Readonly<SQLWrapper>, itemIds: readonly number[]) {
  return sql`${column} in (select value from json_each(${JSON.stringify(itemIds)}))`;
}

const sibling = alias(itemTags, "sibling");

export const TOPIC_KIND: CatalogKind = {
  step: "topic-keys",
  table: topics,
  linked: async (db, id) => {
    const rows = await db
      .select({ id: items.id })
      .from(items)
      .where(eq(items.topicId, id))
      .orderBy(asc(items.id))
      .limit(MERGE_ITEMS);

    return rows.map((row) => row.id);
  },
  relink: (db, loser, survivor, itemIds) => [
    db
      .update(items)
      .set({ topicId: survivor })
      .where(and(eq(items.topicId, loser), among(items.id, itemIds))),
  ],
  unlinked: (db, id) =>
    notExists(
      db
        .select({ one: sql`1` })
        .from(items)
        .where(eq(items.topicId, id)),
    ),
};

export const TAG_KIND: CatalogKind = {
  step: "tag-keys",
  table: tags,
  linked: async (db, id) => {
    const rows = await db
      .select({ id: itemTags.itemId })
      .from(itemTags)
      .where(eq(itemTags.tagId, id))
      .orderBy(asc(itemTags.itemId))
      .limit(MERGE_ITEMS);

    return rows.map((row) => row.id);
  },
  relink: (db, loser, survivor, itemIds) => [
    db
      .update(itemTags)
      .set({ tagId: survivor })
      .where(
        and(
          eq(itemTags.tagId, loser),
          among(itemTags.itemId, itemIds),
          notExists(
            db
              .select({ one: sql`1` })
              .from(sibling)
              .where(and(eq(sibling.itemId, itemTags.itemId), eq(sibling.tagId, survivor))),
          ),
        ),
      ),
    db.delete(itemTags).where(and(eq(itemTags.tagId, loser), among(itemTags.itemId, itemIds))),
    ...tagPartWrites(db, among(items.id, itemIds)),
  ],
  unlinked: (db, id) =>
    notExists(
      db
        .select({ one: sql`1` })
        .from(itemTags)
        .where(eq(itemTags.tagId, id)),
    ),
};
