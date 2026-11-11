import { type SQL, type SQLWrapper, and, asc, eq, notExists, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { alias } from "drizzle-orm/sqlite-core";

import type { Database } from "./ports.ts";
import { itemTags, items, logEntries, tags, topicLeases, topicPages, topics } from "./schema.ts";
import { tagPartWrites } from "./search.ts";

export const MERGE_ITEMS = 500;

export interface Moves {
  readonly itemIds: readonly number[];
  readonly entryIds: readonly number[];
}

export interface CatalogKind {
  readonly step: string;
  readonly table: typeof topics | typeof tags;
  readonly linked: (db: Database, id: number) => Promise<Moves>;
  readonly relink: (
    db: Database,
    loser: number,
    survivor: number,
    moves: Readonly<Moves>,
  ) => readonly BatchItem<"sqlite">[];
  readonly unlinked: (db: Database, id: number) => SQL | undefined;
}

async function firstIds(
  db: Database,
  // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a Drizzle column type holds mutable config, so it cannot be deeply readonly.
  ids: typeof items.id | typeof logEntries.id | typeof itemTags.itemId,
  owner: Readonly<SQLWrapper>,
  id: number,
) {
  const rows = await db
    .select({ id: ids })
    .from(ids.table)
    .where(eq(owner, id))
    .orderBy(asc(ids))
    .limit(MERGE_ITEMS);

  return rows.map((row) => row.id);
}

function among(column: Readonly<SQLWrapper>, itemIds: readonly number[]) {
  return sql`${column} in (select value from json_each(${JSON.stringify(itemIds)}))`;
}

const sibling = alias(itemTags, "sibling");

function emptied(db: Database, id: number) {
  return and(
    notExists(
      db
        .select({ one: sql`1` })
        .from(items)
        .where(eq(items.topicId, id)),
    ),
    notExists(
      db
        .select({ one: sql`1` })
        .from(logEntries)
        .where(eq(logEntries.topicId, id)),
    ),
  );
}

export const TOPIC_KIND: CatalogKind = {
  step: "topic-keys",
  table: topics,
  linked: async (db, id) => ({
    itemIds: await firstIds(db, items.id, items.topicId, id),
    entryIds: await firstIds(db, logEntries.id, logEntries.topicId, id),
  }),
  relink: (db, loser, survivor, { itemIds, entryIds }) => [
    db
      .update(items)
      .set({ topicId: survivor })
      .where(and(eq(items.topicId, loser), among(items.id, itemIds))),
    db
      .update(logEntries)
      .set({ topicId: survivor })
      .where(and(eq(logEntries.topicId, loser), among(logEntries.id, entryIds))),
    db.delete(topicPages).where(and(eq(topicPages.topicId, loser), emptied(db, loser))),
    db.delete(topicLeases).where(and(eq(topicLeases.topicId, loser), emptied(db, loser))),
  ],
  unlinked: emptied,
};

export const TAG_KIND: CatalogKind = {
  step: "tag-keys",
  table: tags,
  linked: async (db, id) => ({
    itemIds: await firstIds(db, itemTags.itemId, itemTags.tagId, id),
    entryIds: [],
  }),
  relink: (db, loser, survivor, { itemIds }) => [
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
