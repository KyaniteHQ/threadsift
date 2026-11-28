import { type SQL, type SQLWrapper, and, asc, eq, gt, notExists, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { catalogKey, renamedTags } from "../../../core/contract/catalog-key.ts";
import type { Digest } from "../../../core/contract/digest-schema.ts";
import type { Database } from "../../../core/kernel/database.ts";
import {
  type DigestRead,
  type StoredDigest,
  readStoredDigest,
  storedDigests,
  storedTags,
  unchangedDigests,
} from "../../../core/kernel/digest-stored.ts";
import { report } from "../../../core/kernel/failure-log.ts";
import { wokenBotWaits } from "../../../core/kernel/job-waiting.ts";
import { digests, items, itemTags } from "../../../core/kernel/schema.ts";
import { among } from "../../../core/kernel/sql-expressions.ts";
import { STALE } from "../../../core/kernel/vault-stale.ts";
import { siblingTags, tagPartWrites } from "../../item/core/search.ts";
import type { Side } from "./merge-unit.ts";

export const REWRITE_UNIT_ITEMS = 100;

interface RewriteUnit {
  readonly itemIds: readonly number[];
  readonly last: number;
  readonly moving: SQL;
  readonly writes: readonly BatchItem<"sqlite">[];
}

function tagMoves(
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
              .from(siblingTags)
              .where(and(eq(siblingTags.itemId, itemTags.itemId), eq(siblingTags.tagId, survivor))),
          ),
        ),
      ),
    db.delete(itemTags).where(and(eq(itemTags.tagId, loser), within(itemTags.itemId))),
    ...tagPartWrites(db, within(items.id)),
  ];
}

function digestsUnchanged(reads: readonly DigestRead[]) {
  const unchanged = unchangedDigests(reads);

  return (column: Readonly<SQLWrapper>) => sql`${column} in (${unchanged})`;
}

function mergedTags(
  { tags }: Readonly<Digest>,
  { from, into }: Readonly<{ from: Side; into: Side }>,
): readonly string[] | null {
  if (!tags.some((name) => catalogKey(name) === from.key)) return null;

  return renamedTags(tags, (key) => (key === from.key ? into.name : undefined));
}

function readsStoredTags({ tags }: Readonly<StoredDigest>, digest: Readonly<Digest>): boolean {
  return tags !== null && JSON.stringify(JSON.parse(tags)) === JSON.stringify(digest.tags);
}

function readableDigests(
  stored: readonly Readonly<StoredDigest>[],
  merge: Readonly<{ from: Side; into: Side }>,
) {
  return stored.flatMap((row) => {
    const read = readStoredDigest(row.digest);

    if (read.kind === "unreadable" || !readsStoredTags(row, read.digest)) {
      report("merge-digest-unreadable", { itemId: row.itemId });

      return [];
    }

    return [{ row, rewritten: mergedTags(read.digest, merge) } as const];
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
  { from, into, after }: Readonly<{ from: Side; into: Side; after: number }>,
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

  const moving = sql`(select count(*) from ${itemTags} where ${itemTags.tagId} = ${from.id} and ${unchanged(itemTags.itemId)})`;

  return {
    itemIds,
    last: itemIds.at(-1) ?? 0,
    moving,
    writes: [
      wokenBotWaits(db, { moved: { kind: "library" }, now: Date.now(), when: sql`${moving} > 0` }),
      ...STALE.itemChanged(
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
