import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";

import { parseStoredDigest } from "./ai-contract.ts";
import { linkingDigest, pinnedCatalog } from "./catalog.ts";
import { logFailure } from "./failure-log.ts";
import type { Database } from "./ports.ts";
import { catalogLinking, digests, guardedBatch, items } from "./schema.ts";
import { digestPartWrites } from "./search.ts";

const OLDER_DIGEST_BATCH = 10;

async function linkOlderDigest(
  db: Database,
  row: Readonly<{ id: number; digest: string }>,
): Promise<void> {
  try {
    const stored = parseStoredDigest(row.digest);
    const { pinned, entries } = await pinnedCatalog(db, stored);
    const unlinked = sql`exists (select 1 from ${items} join ${digests} on ${digests.itemId} = ${items.id} where ${items.id} = ${row.id} and ${items.topicId} is null and ${digests.digest} = ${row.digest})`;
    await guardedBatch(db, sql`${unlinked} and ${pinned.current}`, [
      ...linkingDigest(db, row.id, entries),
      ...(pinned.renamed
        ? [
            db
              .update(digests)
              .set({
                digest: JSON.stringify({ ...stored, tags: pinned.tags, topic: pinned.topic }),
                topic: pinned.topic,
              })
              .where(eq(digests.itemId, row.id)),
          ]
        : []),
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
