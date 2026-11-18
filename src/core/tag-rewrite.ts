import { type SQL, type SQLWrapper, and, asc, eq, gt, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { parseStoredDigest } from "./ai-contract.ts";
import { tagMoves } from "./catalog-key-links.ts";
import { catalogKey } from "./catalog-key.ts";
import {
  type DigestRead,
  type StoredDigest,
  storedDigests,
  storedTags,
  unchangedDigests,
} from "./digest-state.ts";
import { report } from "./failure-log.ts";
import { among } from "./guards.ts";
import { renamedTags } from "./pins.ts";
import type { Database } from "./ports.ts";
import { digests, items, itemTags } from "./schema.ts";
import { queueVaultItems } from "./vault-queue.ts";

export const REWRITE_UNIT_ITEMS = 100;

interface TagRef {
  readonly id: number;
  readonly key: string;
  readonly name: string;
}

interface RewriteUnit {
  readonly itemIds: readonly number[];
  readonly last: number;
  readonly moving: SQL;
  readonly writes: readonly BatchItem<"sqlite">[];
}

function digestsUnchanged(reads: readonly DigestRead[]) {
  const unchanged = unchangedDigests(reads);

  return (column: Readonly<SQLWrapper>) => sql`${column} in (${unchanged})`;
}

function mergedTags(
  { digest }: Readonly<StoredDigest>,
  { from, into }: Readonly<{ from: TagRef; into: TagRef }>,
): readonly string[] | null {
  const parsed = parseStoredDigest(digest);

  if (!parsed.tags.some((name) => catalogKey(name) === from.key)) return null;

  return renamedTags(parsed.tags, (key) => (key === from.key ? into.name : undefined));
}

function readableDigests(
  stored: readonly Readonly<StoredDigest>[],
  merge: Readonly<{ from: TagRef; into: TagRef }>,
) {
  return stored.flatMap((row) => {
    try {
      return [{ row, rewritten: mergedTags(row, merge) } as const];
    } catch {
      report("merge-digest-unreadable", { itemId: row.itemId });

      return [];
    }
  });
}

function digestRewrites(db: Database, reading: Readonly<ReturnType<typeof readableDigests>>) {
  return reading.flatMap(({ row, rewritten }) =>
    rewritten === null
      ? []
      : [
          db
            .update(digests)
            .set({
              digest: sql`json_set(${digests.digest}, '$.tags', json(${JSON.stringify(rewritten)}))`,
            })
            .where(
              and(
                eq(digests.itemId, row.itemId),
                eq(digests.taskId, row.taskId),
                sql`${storedTags} is ${row.tags}`,
              ),
            ),
        ],
  );
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

  const stored = itemIds.length === 0 ? [] : await storedDigests(db, itemIds);

  const read = new Map(stored.map((row) => [row.itemId, row]));

  const unchanged = digestsUnchanged(
    itemIds.map((id) => ({
      id,
      task: read.get(id)?.taskId ?? null,
      tags: read.get(id)?.tags ?? null,
    })),
  );
  const readable = readableDigests(stored, { from, into });

  return {
    itemIds,
    last: itemIds.at(-1) ?? 0,
    moving: sql`(select count(*) from ${itemTags} where ${itemTags.tagId} = ${from.id} and ${unchanged(itemTags.itemId)})`,
    writes: [
      queueVaultItems(
        db,
        sql`${among(
          items.id,
          readable.map(({ row }) => row.itemId),
        )} and ${items.id} in (select ${itemTags.itemId} from ${itemTags} where ${itemTags.tagId} = ${from.id} and ${unchanged(itemTags.itemId)})`,
      ),
      ...tagMoves(db, from.id, into.id, unchanged),
      ...digestRewrites(db, readable),
    ],
  };
}
