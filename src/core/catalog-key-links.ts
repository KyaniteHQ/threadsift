import { type SQL, type SQLWrapper, and, asc, eq, notExists, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { alias } from "drizzle-orm/sqlite-core";

import type { MergeKind } from "./kinds.ts";
import { repointedPins, repointedTopicPins } from "./pins.ts";
import type { Database } from "./ports.ts";
import { proposalRelinks } from "./proposal-relink.ts";
import {
  catalogVersion,
  dataStepRenames,
  digests,
  itemTags,
  items,
  logEntries,
  pins,
  proposals,
  tags,
  topicLeases,
  topics,
} from "./schema.ts";
import { tagPartWrites } from "./search.ts";
import { continuingOverview, overviewRemoved } from "./topic-overview-run.ts";

export const MERGE_ITEMS = 500;

export interface Moves {
  readonly itemIds: readonly number[];
  readonly entryIds: readonly number[];
}

export interface CatalogKind {
  readonly step: string;
  readonly table: typeof topics | typeof tags;
  readonly pinKind: MergeKind;
  readonly pinTarget: typeof pins.intoTagId | typeof pins.intoTopicId;
  readonly proposalFrom: typeof proposals.fromTagId | typeof proposals.fromTopicId;
  readonly proposalInto: typeof proposals.intoTagId | typeof proposals.intoTopicId;
  readonly linked: (db: Database, id: number) => Promise<Moves>;
  readonly relink: (
    db: Database,
    loser: number,
    survivor: number,
    moves: Readonly<Moves>,
  ) => readonly BatchItem<"sqlite">[];
  readonly unlinked: (db: Database, id: number) => SQL;
}

async function firstIds(
  db: Database,
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

export function among(column: Readonly<SQLWrapper>, itemIds: readonly number[]) {
  return sql`${column} in (select value from json_each(${JSON.stringify(itemIds)}))`;
}

const sibling = alias(itemTags, "sibling");

function emptied(db: Database, id: number): SQL {
  return sql`${notExists(
    db
      .select({ one: sql`1` })
      .from(items)
      .where(eq(items.topicId, id)),
  )} and ${notExists(
    db
      .select({ one: sql`1` })
      .from(logEntries)
      .where(eq(logEntries.topicId, id)),
  )}`;
}

export function isLastUnit({ itemIds, entryIds }: Readonly<Moves>): boolean {
  return itemIds.length < MERGE_ITEMS && entryIds.length < MERGE_ITEMS;
}

export function topicMoves(
  db: Database,
  loser: number,
  survivor: number,
  { itemIds, entryIds }: Readonly<Moves>,
) {
  const survivorName = sql`(select ${topics.name} from ${topics} where ${topics.id} = ${survivor})`;

  return [
    db
      .update(digests)
      .set({
        topic: survivorName,
        digest: sql`case when json_valid(${digests.digest}) then json_set(${digests.digest}, '$.topic', ${survivorName}) else ${digests.digest} end`,
      })
      .where(
        and(
          among(digests.itemId, itemIds),
          sql`${digests.itemId} in (select ${items.id} from ${items} where ${items.topicId} = ${loser})`,
        ),
      ),
    db
      .update(items)
      .set({ topicId: survivor })
      .where(and(eq(items.topicId, loser), among(items.id, itemIds))),
    db
      .update(logEntries)
      .set({ topicId: survivor })
      .where(and(eq(logEntries.topicId, loser), among(logEntries.id, entryIds))),
    overviewRemoved(db, loser, emptied(db, loser)),
    db.delete(topicLeases).where(and(eq(topicLeases.topicId, loser), emptied(db, loser))),
  ];
}

export const TOPIC_KIND: CatalogKind = {
  step: "topic-keys",
  table: topics,
  pinKind: "topic-merge",
  pinTarget: pins.intoTopicId,
  proposalFrom: proposals.fromTopicId,
  proposalInto: proposals.intoTopicId,
  linked: async (db, id) => ({
    itemIds: await firstIds(db, items.id, items.topicId, id),
    entryIds: await firstIds(db, logEntries.id, logEntries.topicId, id),
  }),
  relink: (db, loser, survivor, moves) => [
    ...proposalRelinks(db, "topic-merge", loser, survivor),
    repointedTopicPins(db, loser, survivor),
    ...topicMoves(db, loser, survivor, moves),
  ],
  unlinked: emptied,
};

export function tagMoves(
  db: Database,
  loser: number,
  survivor: number,
  within: (column: Readonly<SQLWrapper>) => SQL,
) {
  return [
    db
      .update(itemTags)
      .set({ tagId: survivor })
      .where(
        and(
          eq(itemTags.tagId, loser),
          within(itemTags.itemId),
          notExists(
            db
              .select({ one: sql`1` })
              .from(sibling)
              .where(and(eq(sibling.itemId, itemTags.itemId), eq(sibling.tagId, survivor))),
          ),
        ),
      ),
    db.delete(itemTags).where(and(eq(itemTags.tagId, loser), within(itemTags.itemId))),
    ...tagPartWrites(db, within(items.id)),
  ];
}

export const TAG_KIND: CatalogKind = {
  step: "tag-keys",
  table: tags,
  pinKind: "tag-merge",
  pinTarget: pins.intoTagId,
  proposalFrom: proposals.fromTagId,
  proposalInto: proposals.intoTagId,
  linked: async (db, id) => ({
    itemIds: await firstIds(db, itemTags.itemId, itemTags.tagId, id),
    entryIds: [],
  }),
  relink: (db, loser, survivor, { itemIds }) => [
    ...proposalRelinks(db, "tag-merge", loser, survivor),
    repointedPins(db, loser, survivor),
    ...tagMoves(db, loser, survivor, (column) => among(column, itemIds)),
  ],
  unlinked: (db, id) =>
    notExists(
      db
        .select({ one: sql`1` })
        .from(itemTags)
        .where(eq(itemTags.tagId, id)),
    ),
};

export function closingWrites(
  db: Database,
  kind: CatalogKind,
  id: number,
  before: readonly BatchItem<"sqlite">[] = [],
) {
  const gone = kind.unlinked(db, id);

  return [
    ...before,
    db.insert(catalogVersion).values({ id: 1, version: 0 }).onConflictDoNothing(),
    db
      .update(catalogVersion)
      .set({ version: sql`${catalogVersion.version} + 1` })
      .where(and(eq(catalogVersion.id, 1), gone)),
    db
      .delete(dataStepRenames)
      .where(and(eq(dataStepRenames.step, kind.step), eq(dataStepRenames.subject, id), gone)),
    db.delete(kind.table).where(and(eq(kind.table.id, id), gone)),
  ];
}

export function topicClosingWrites(
  db: Database,
  loser: number,
  survivor: number,
  before: readonly BatchItem<"sqlite">[],
) {
  const opening = continuingOverview(db, survivor, TOPIC_KIND.unlinked(db, loser));

  return {
    writes: closingWrites(db, TOPIC_KIND, loser, [...before, opening]),
    wakes: [before.length],
  };
}
