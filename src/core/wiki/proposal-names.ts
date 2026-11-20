import { count, eq, inArray, sql } from "drizzle-orm";

import type { Database } from "../kernel/database.ts";
import { itemTags, items, tags, topics } from "../kernel/schema.ts";
import type { SentSubject, TagSubject, TopicSubject } from "./proposal-sent.ts";

export const NAMES_PER_SUBJECT = 3;

interface NameRow {
  readonly owner: number;
  readonly key: string;
  readonly name: string;
  readonly used: number;
}

type Base = Readonly<{ id: number; name: string; items: number }>;

export interface SentNames<Subject extends SentSubject> {
  readonly of: (
    db: Database,
    ids: readonly number[],
  ) => Promise<ReadonlyMap<number, readonly string[]>>;
  readonly subject: (base: Base, names: readonly string[]) => Subject;
}

function mostUsed(rows: readonly Readonly<NameRow>[]): ReadonlyMap<number, readonly string[]> {
  const byOwner = Map.groupBy(rows, ({ owner }) => owner);

  return new Map(
    [...byOwner].map(([owner, each]) => [
      owner,
      each
        .toSorted((first, second) => second.used - first.used || (first.key < second.key ? -1 : 1))
        .slice(0, NAMES_PER_SUBJECT)
        .map(({ name }) => name),
    ]),
  );
}

export const TOPICS_OF_TAG: SentNames<TagSubject> = {
  of: async (db, ids) =>
    mostUsed(
      await db
        .select({ owner: itemTags.tagId, key: topics.key, name: topics.name, used: count() })
        .from(itemTags)
        .innerJoin(items, eq(items.id, itemTags.itemId))
        .innerJoin(topics, eq(topics.id, items.topicId))
        .where(inArray(itemTags.tagId, ids))
        .groupBy(itemTags.tagId, topics.id),
    ),
  subject: (base, names) => ({ ...base, topics: names }),
};

export const TAGS_OF_TOPIC: SentNames<TopicSubject> = {
  of: async (db, ids) =>
    mostUsed(
      await db
        .select({
          owner: sql<number>`${items.topicId}`,
          key: tags.key,
          name: tags.name,
          used: count(),
        })
        .from(items)
        .innerJoin(itemTags, eq(itemTags.itemId, items.id))
        .innerJoin(tags, eq(tags.id, itemTags.tagId))
        .where(inArray(items.topicId, ids))
        .groupBy(items.topicId, tags.id),
    ),
  subject: (base, names) => ({ ...base, tags: names }),
};
