import { type SQL, type SQLWrapper, and, desc, eq, sql } from "drizzle-orm";

import { catalogKey } from "../../../core/contract/catalog-key.ts";
import type { Digest } from "../../../core/contract/digest-schema.ts";
import type { CatalogTable } from "../../../core/kernel/catalog-tables.ts";
import { TAG_USES, TOPIC_USES } from "../../../core/kernel/catalog-uses.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { loggedDigest, loggedTopic } from "../../../core/kernel/log-writes.ts";
import {
  UninitializedDatabase,
  catalogVersion,
  items,
  itemTags,
  tags,
  topics,
} from "../../../core/kernel/schema.ts";
import { amongJson } from "../../../core/kernel/sql-expressions.ts";
import { STALE } from "../../../core/kernel/vault-stale.ts";
import { CATALOG_NAME_LIMIT } from "./catalog-budget.ts";
import { pinnedDigest } from "./pins.ts";
import { openingOverview } from "./topic-overview-run.ts";

function catalogEntries(digest: Readonly<Digest>) {
  const names = new Map<string, { readonly key: string; readonly name: string }>();

  for (const name of digest.tags) {
    const key = catalogKey(name);

    if (!names.has(key)) names.set(key, { key, name });
  }

  return {
    topic: { key: catalogKey(digest.topic), name: digest.topic },
    tags: [...names.values()],
    tagKeys: JSON.stringify([...names.keys()]),
  } as const;
}

export type CatalogEntries = Readonly<ReturnType<typeof catalogEntries>>;

export async function pinnedCatalog(db: Database, digest: Readonly<Digest>) {
  const pinned = await pinnedDigest(db, digest);

  return {
    pinned,
    entries: catalogEntries({ ...digest, tags: pinned.tags, topic: pinned.topic }),
  };
}

const CATALOG_VERSION = sql<number>`(select version from ${catalogVersion} where id = 1)`;

function versionRow(db: Database) {
  return db
    .select({ version: catalogVersion.version })
    .from(catalogVersion)
    .where(eq(catalogVersion.id, 1));
}

function versionOf(rows: readonly Readonly<{ version: number }>[]): number {
  const [row] = rows;

  if (row === undefined) throw new UninitializedDatabase("catalog_version");

  return row.version;
}

export async function readCatalogVersion(db: Database): Promise<number> {
  return versionOf(await versionRow(db));
}

export function catalogCurrent(version: number, entries: CatalogEntries) {
  const keys = entries.tagKeys;

  return sql`(${CATALOG_VERSION} = ${version} or (exists (select 1 from ${topics} where key = ${entries.topic.key}) and not exists (select 1 from json_each(${keys}) wanted where not exists (select 1 from ${tags} where key = wanted.value))))`;
}

function topNames(db: Database, table: Readonly<SQLWrapper>, usage: Readonly<SQLWrapper>) {
  return db
    .select({ name: sql<string>`${table}.name` })
    .from(sql`${table}`)
    .orderBy(desc(sql`${usage}`), sql`${table}.id`)
    .limit(CATALOG_NAME_LIMIT);
}

export async function readCatalog(db: Database) {
  const [version, topicNames, tagNames] = await db.batch([
    versionRow(db),
    topNames(db, topics, TOPIC_USES),
    topNames(db, tags, TAG_USES),
  ]);

  return {
    version: versionOf(version),
    topics: topicNames.map(({ name }) => name),
    tags: tagNames.map(({ name }) => name),
  };
}

function bumpedWhen(db: Database, when: SQL, by: SQL) {
  return db
    .update(catalogVersion)
    .set({ version: sql`${catalogVersion.version} + ${by}` })
    .where(and(eq(catalogVersion.id, 1), when));
}

function bumpVersion(db: Database) {
  return bumpedWhen(db, sql`changes() > 0`, sql`changes()`);
}

export function retired(db: Database, table: CatalogTable, id: number, gone: SQL) {
  return [bumpedWhen(db, gone, sql`1`), db.delete(table).where(and(eq(table.id, id), gone))];
}

function linkingDigest(db: Database, itemId: number, entries: CatalogEntries, title: string) {
  const keys = entries.tagKeys;

  return [
    db.insert(topics).values(entries.topic).onConflictDoNothing({ target: topics.key }),
    bumpVersion(db),
    ...loggedTopic(db, entries.topic.key),
    ...STALE.digestLinked(db, { itemId, title, topicKey: entries.topic.key }),
    db
      .insert(tags)
      .select(
        db
          .select({
            id: sql<null>`null`.as("id"),
            key: sql<string>`json_extract(value, '$.key')`.as("key"),
            name: sql<string>`json_extract(value, '$.name')`.as("name"),
          })
          .from(sql`json_each(${JSON.stringify(entries.tags)})`)
          .where(sql`1`),
      )
      .onConflictDoNothing({ target: tags.key }),
    bumpVersion(db),
    db
      .update(items)
      .set({ topicId: sql`(select id from ${topics} where key = ${entries.topic.key})` })
      .where(eq(items.id, itemId)),
    db
      .delete(itemTags)
      .where(
        and(
          eq(itemTags.itemId, itemId),
          sql`${itemTags.tagId} not in (select id from ${tags} where ${amongJson(tags.key, keys)})`,
        ),
      ),
    db
      .insert(itemTags)
      .select(
        db
          .select({ itemId: sql<number>`${itemId}`.as("item_id"), tagId: tags.id })
          .from(sql`json_each(${keys}) wanted`)
          .innerJoin(tags, sql`${tags.key} = wanted.value`)
          .where(sql`1`),
      )
      .onConflictDoNothing(),
    openingOverview(db, itemId),
  ];
}

export function publishedLinks(
  db: Database,
  itemId: number,
  entries: CatalogEntries,
  title: string,
) {
  return [
    ...linkingDigest(db, itemId, entries, title),
    ...loggedDigest(db, {
      itemId,
      title,
      topicKey: entries.topic.key,
      tagKeys: entries.tagKeys,
    }),
  ];
}
