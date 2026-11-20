import { type SQLWrapper, and, asc, eq, sql } from "drizzle-orm";

import type { Database } from "../../../core/kernel/database.ts";
import { storedWithTopic } from "../../../core/kernel/digest-stored.ts";
import { digests, items, logEntries, topics } from "../../../core/kernel/schema.ts";
import { among } from "../../../core/kernel/sql-expressions.ts";
import { STALE } from "../../../core/kernel/vault-stale.ts";

const MERGE_ITEMS = 500;

interface Linked {
  readonly itemIds: readonly number[];
  readonly entryIds: readonly number[];
}

async function firstIds(
  db: Database,
  ids: typeof items.id | typeof logEntries.id,
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

export async function topicLinked(db: Database, id: number): Promise<Linked> {
  return {
    itemIds: await firstIds(db, items.id, items.topicId, id),
    entryIds: await firstIds(db, logEntries.id, logEntries.topicId, id),
  };
}

export function topicMoves(
  db: Database,
  loser: number,
  survivor: number,
  { itemIds, entryIds }: Readonly<Linked>,
) {
  const survivorName = sql`(select ${topics.name} from ${topics} where ${topics.id} = ${survivor})`;
  const moving = and(eq(items.topicId, loser), among(items.id, itemIds));

  return [
    ...STALE.topicMoved(db, { loser, survivor, moving }),
    db
      .update(digests)
      .set({
        topic: survivorName,
        digest: storedWithTopic(survivorName),
      })
      .where(
        and(
          among(digests.itemId, itemIds),
          sql`${digests.itemId} in (select ${items.id} from ${items} where ${items.topicId} = ${loser})`,
        ),
      ),
    db.update(items).set({ topicId: survivor }).where(moving),
    db
      .update(logEntries)
      .set({ topicId: survivor })
      .where(and(eq(logEntries.topicId, loser), among(logEntries.id, entryIds))),
  ];
}
