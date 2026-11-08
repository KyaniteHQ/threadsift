import { type SQLWrapper, and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";

import { type Digest, parseStoredDigest } from "./ai-contract.ts";
import { CATALOG_NAME_LIMIT } from "./digest-prompt.ts";
import { logFailure } from "./failure-log.ts";
import type { JobWrites } from "./job-outcome.ts";
import type { Database } from "./ports.ts";
import {
  catalogLinking,
  catalogVersion,
  digests,
  guardedBatch,
  items,
  itemTags,
  tags,
  topics,
} from "./schema.ts";
import { digestPartWrites } from "./search.ts";

const OLDER_DIGEST_BATCH = 10;

export function catalogKey(name: string): string {
  return name.normalize("NFKC").toLowerCase().trim().replaceAll(/\s+/gu, " ");
}

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

export function catalogCurrent(version: number, entries: CatalogEntries) {
  const keys = entries.tagKeys;

  return sql`(coalesce((select version from ${catalogVersion} where id = 1), 0) = ${version} or (exists (select 1 from ${topics} where key = ${entries.topic.key}) and not exists (select 1 from json_each(${keys}) wanted where not exists (select 1 from ${tags} where key = wanted.value))))`;
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

export function linkingDigest(db: Database, itemId: number, entries: CatalogEntries): JobWrites {
  const keys = entries.tagKeys;

  return [
    db.insert(catalogVersion).values({ id: 1, version: 0 }).onConflictDoNothing(),
    db.insert(topics).values(entries.topic).onConflictDoNothing({ target: topics.key }),
    bumpVersion(db),
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
  ];
}

async function linkOlderDigest(
  db: Database,
  row: Readonly<{ id: number; digest: string }>,
): Promise<void> {
  try {
    const entries = catalogEntries(parseStoredDigest(row.digest));
    const current = sql`exists (select 1 from ${items} join ${digests} on ${digests.itemId} = ${items.id} where ${items.id} = ${row.id} and ${items.topicId} is null and ${digests.digest} = ${row.digest})`;
    await guardedBatch(db, current, [
      ...linkingDigest(db, row.id, entries),
      ...digestPartWrites(db, eq(items.id, row.id)),
    ]);
  } catch (error) {
    logFailure("older-digest-not-linked", { digestId: row.id }, error);
  }
}

function olderDigestRows(db: Database, after: number) {
  return db
    .select({ id: items.id, digest: digests.digest })
    .from(items)
    .innerJoin(digests, eq(digests.itemId, items.id))
    .where(and(isNull(items.topicId), gt(items.id, after)))
    .orderBy(asc(items.id))
    .limit(OLDER_DIGEST_BATCH);
}

export async function linkOlderDigests(db: Database): Promise<void> {
  const [cursor] = await db.select().from(catalogLinking).where(eq(catalogLinking.id, 1));
  const after = cursor?.lastItemId ?? 0;
  const next = await olderDigestRows(db, after);
  const older = next.length === 0 && after > 0 ? await olderDigestRows(db, 0) : next;
  const lastItemId = older.at(-1)?.id ?? 0;
  await db
    .insert(catalogLinking)
    .values({ id: 1, lastItemId })
    .onConflictDoUpdate({ target: catalogLinking.id, set: { lastItemId } });

  for (const row of older) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Stored Digests are linked sequentially.
    await linkOlderDigest(db, row);
  }
}
