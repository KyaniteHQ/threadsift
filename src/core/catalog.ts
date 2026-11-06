import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { DIGEST_CATALOG_BYTES, DigestSchema, type Digest } from "./ai-contract.ts";
import type { JobWrites } from "./job-outcome.ts";
import type { Database } from "./ports.ts";
import { catalogVersion, digests, guards, items, itemTags, tags, topics } from "./schema.ts";

export function catalogKey(name: string): string {
  return name.normalize("NFKC").toLowerCase().trim().replaceAll(/\s+/gu, " ");
}

export function catalogCurrent(version: number, digest: Readonly<Digest>) {
  const keys = JSON.stringify([...new Set(digest.tags.map(catalogKey))]);

  return sql`(coalesce((select version from ${catalogVersion} where id = 1), 0) = ${version} or (exists (select 1 from ${topics} where key = ${catalogKey(digest.topic)}) and not exists (select 1 from json_each(${keys}) wanted where not exists (select 1 from ${tags} where key = wanted.value))))`;
}

export async function readCatalog(db: Database) {
  const [version, topicNames, tagNames] = await db.batch([
    db
      .select({ version: catalogVersion.version })
      .from(catalogVersion)
      .where(eq(catalogVersion.id, 1)),
    db
      .select({ name: topics.name })
      .from(topics)
      .orderBy(
        desc(sql`(select count(*) from ${items} where ${items.topicId} = ${topics.id})`),
        topics.id,
      )
      .limit(DIGEST_CATALOG_BYTES),
    db
      .select({ name: tags.name })
      .from(tags)
      .orderBy(
        desc(sql`(select count(*) from ${itemTags} where ${itemTags.tagId} = ${tags.id})`),
        tags.id,
      )
      .limit(DIGEST_CATALOG_BYTES),
  ]);

  return {
    version: version[0]?.version ?? 0,
    topics: topicNames.map(({ name }) => name),
    tags: tagNames.map(({ name }) => name),
  };
}

function creatingName(db: Database, kind: "topic" | "tag", name: string): JobWrites {
  const table = kind === "topic" ? topics : tags;

  return [
    db
      .insert(table)
      .values({ key: catalogKey(name), name })
      .onConflictDoNothing({ target: table.key }),
    db
      .update(catalogVersion)
      .set({ version: sql`${catalogVersion.version} + changes()` })
      .where(eq(catalogVersion.id, 1)),
  ];
}

export function linkingDigest(db: Database, itemId: number, digest: Readonly<Digest>): JobWrites {
  return [
    db.insert(catalogVersion).values({ id: 1, version: 0 }).onConflictDoNothing(),
    ...creatingName(db, "topic", digest.topic),
    ...digest.tags.flatMap((name) => creatingName(db, "tag", name)),
    db
      .update(items)
      .set({ topicId: sql`(select id from ${topics} where key = ${catalogKey(digest.topic)})` })
      .where(eq(items.id, itemId)),
    db.delete(itemTags).where(eq(itemTags.itemId, itemId)),
    ...digest.tags.map((name) =>
      db
        .insert(itemTags)
        .select(
          db
            .select({ itemId: sql<number>`${itemId}`.as("item_id"), tagId: tags.id })
            .from(tags)
            .where(eq(tags.key, catalogKey(name))),
        )
        .onConflictDoNothing(),
    ),
  ];
}

export async function linkOlderDigests(db: Database): Promise<void> {
  const older = await db
    .select({ id: items.id, digest: digests.digest })
    .from(items)
    .innerJoin(digests, eq(digests.itemId, items.id))
    .where(isNull(items.topicId))
    .limit(10);

  await Promise.all(
    older.map(async (row) => {
      try {
        await db.batch([
          db.insert(guards).select(
            db
              .select({ ok: sql<number>`count(*)`.as("ok") })
              .from(items)
              .innerJoin(digests, eq(digests.itemId, items.id))
              .where(
                and(eq(items.id, row.id), isNull(items.topicId), eq(digests.digest, row.digest)),
              ),
          ),
          ...linkingDigest(db, row.id, DigestSchema.parse(JSON.parse(row.digest))),
          db.delete(guards),
        ]);
      } catch {
        const [current] = await db
          .select({ digest: digests.digest, topicId: items.topicId })
          .from(items)
          .innerJoin(digests, eq(digests.itemId, items.id))
          .where(eq(items.id, row.id));

        if (current?.topicId === null && current.digest === row.digest)
          throw new Error("Older Digest linking failed");
      }
    }),
  );
}
