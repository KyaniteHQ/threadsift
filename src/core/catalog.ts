import { type SQLWrapper, and, desc, eq, sql } from "drizzle-orm";

import type { Digest } from "./ai-contract.ts";
import { catalogKey } from "./catalog-key.ts";
import { CATALOG_NAME_LIMIT } from "./digest-prompt.ts";
import { loggedDigest, loggedTopic } from "./log-writes.ts";
import { pinnedDigest } from "./pins.ts";
import type { Database } from "./ports.ts";
import { catalogVersion, items, itemTags, tags, topics } from "./schema.ts";
import { openingOverview } from "./topic-overview-run.ts";

export function catalogEntries(digest: Readonly<Digest>) {
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

type CatalogEntries = Readonly<ReturnType<typeof catalogEntries>>;

export async function pinnedCatalog(db: Database, digest: Readonly<Digest>) {
  const pinned = await pinnedDigest(db, digest);

  return {
    pinned,
    entries: catalogEntries({ ...digest, tags: pinned.tags, topic: pinned.topic }),
  };
}

const CATALOG_VERSION = sql<number>`coalesce((select version from ${catalogVersion} where id = 1), 0)`;

export async function readCatalogVersion(db: Database): Promise<number> {
  const [row] = await db.select({ version: CATALOG_VERSION }).from(sql`(select 1) as one`);

  return row?.version ?? 0;
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
    db
      .select({ version: catalogVersion.version })
      .from(catalogVersion)
      .where(eq(catalogVersion.id, 1)),
    topNames(
      db,
      topics,
      sql`(select count(*) from ${items} where ${items.topicId} = ${topics.id})`,
    ),
    topNames(
      db,
      tags,
      sql`(select count(*) from ${itemTags} where ${itemTags.tagId} = ${tags.id})`,
    ),
  ]);

  return {
    version: version[0]?.version ?? 0,
    topics: topicNames.map(({ name }) => name),
    tags: tagNames.map(({ name }) => name),
  };
}

function bumpVersion(db: Database) {
  return db
    .update(catalogVersion)
    .set({ version: sql`${catalogVersion.version} + changes()` })
    .where(and(eq(catalogVersion.id, 1), sql`changes() > 0`));
}

export function linkingDigest(db: Database, itemId: number, entries: CatalogEntries) {
  const keys = entries.tagKeys;

  return [
    db.insert(catalogVersion).values({ id: 1, version: 0 }).onConflictDoNothing(),
    db.insert(topics).values(entries.topic).onConflictDoNothing({ target: topics.key }),
    bumpVersion(db),
    loggedTopic(db, entries.topic.key),
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
          sql`${itemTags.tagId} not in (select id from ${tags} where key in (select value from json_each(${keys})))`,
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
    ...linkingDigest(db, itemId, entries),
    loggedDigest(db, {
      itemId,
      title,
      topicKey: entries.topic.key,
      tagKeys: entries.tagKeys,
    }),
  ];
}
