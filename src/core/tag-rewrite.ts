import { type SQL, type SQLWrapper, and, asc, eq, gt, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { parseStoredDigest } from "./ai-contract.ts";
import { TAG_KIND, tagMoves } from "./catalog-key-links.ts";
import { catalogKey } from "./catalog-key.ts";
import { report } from "./data-step-support.ts";
import { type DigestRead, storedTags, unchangedDigests } from "./digest-state.ts";
import { renamedTags } from "./pins.ts";
import type { Database } from "./ports.ts";
import { catalogVersion, dataStepRenames, digests, itemTags, tags } from "./schema.ts";

export const REWRITE_UNIT_ITEMS = 100;

export interface TagRef {
  readonly id: number;
  readonly key: string;
  readonly name: string;
}

export interface RewriteUnit {
  readonly itemIds: readonly number[];
  readonly last: number;
  readonly moving: SQL;
  readonly writes: readonly BatchItem<"sqlite">[];
}

interface StoredDigest {
  readonly itemId: number;
  readonly digest: string;
  readonly taskId: number;
  readonly tags: string | null;
}

function digestsUnchanged(reads: readonly DigestRead[]) {
  const unchanged = unchangedDigests(reads);

  return (column: Readonly<SQLWrapper>) => sql`${column} in (${unchanged})`;
}

function mergedDigest(
  { digest }: Readonly<StoredDigest>,
  { from, into }: Readonly<{ from: TagRef; into: TagRef }>,
): string | null {
  const parsed = parseStoredDigest(digest);

  if (!parsed.tags.some((name) => catalogKey(name) === from.key)) return null;

  return JSON.stringify({
    ...parsed,
    tags: renamedTags(parsed.tags, (key) => (key === from.key ? into.name : undefined)),
  });
}

export function digestRewrites(
  db: Database,
  stored: readonly Readonly<StoredDigest>[],
  merge: Readonly<{ from: TagRef; into: TagRef }>,
): readonly BatchItem<"sqlite">[] {
  return stored.flatMap((row) => {
    try {
      const rewritten = mergedDigest(row, merge);

      return rewritten === null
        ? []
        : [
            db
              .update(digests)
              .set({ digest: rewritten })
              .where(
                and(
                  eq(digests.itemId, row.itemId),
                  eq(digests.taskId, row.taskId),
                  sql`${storedTags} is ${row.tags}`,
                ),
              ),
          ];
    } catch {
      report("merge-digest-unreadable", { itemId: row.itemId });

      return [];
    }
  });
}

export async function readRewrite(
  db: Database,
  { from, into, after }: Readonly<{ from: TagRef; into: TagRef; after: number }>,
): Promise<RewriteUnit> {
  const linked = await db
    .select({ itemId: itemTags.itemId })
    .from(itemTags)
    .where(and(eq(itemTags.tagId, from.id), gt(itemTags.itemId, after)))
    .orderBy(asc(itemTags.itemId))
    .limit(REWRITE_UNIT_ITEMS);

  const itemIds = linked.map(({ itemId }) => itemId);

  const stored =
    itemIds.length === 0
      ? []
      : await db
          .select({
            itemId: digests.itemId,
            digest: digests.digest,
            taskId: digests.taskId,
            tags: storedTags,
          })
          .from(digests)
          .where(
            sql`${digests.itemId} in (select value from json_each(${JSON.stringify(itemIds)}))`,
          );

  const read = new Map(stored.map((row) => [row.itemId, row]));

  const unchanged = digestsUnchanged(
    itemIds.map((id) => ({
      id,
      task: read.get(id)?.taskId ?? null,
      tags: read.get(id)?.tags ?? null,
    })),
  );

  return {
    itemIds,
    last: itemIds.at(-1) ?? 0,
    moving: sql`(select count(*) from ${itemTags} where ${itemTags.tagId} = ${from.id} and ${unchanged(itemTags.itemId)})`,
    writes: [
      ...tagMoves(db, from.id, into.id, unchanged),
      ...digestRewrites(db, stored, { from, into }),
    ],
  };
}

export function closingWrites(db: Database, tagId: number, logged: readonly BatchItem<"sqlite">[]) {
  const gone = TAG_KIND.unlinked(db, tagId);

  return [
    ...logged,
    db.insert(catalogVersion).values({ id: 1, version: 0 }).onConflictDoNothing(),
    db
      .update(catalogVersion)
      .set({ version: sql`${catalogVersion.version} + 1` })
      .where(and(eq(catalogVersion.id, 1), gone)),
    db
      .delete(dataStepRenames)
      .where(
        and(eq(dataStepRenames.step, TAG_KIND.step), eq(dataStepRenames.subject, tagId), gone),
      ),
    db.delete(tags).where(and(eq(tags.id, tagId), gone)),
  ];
}
