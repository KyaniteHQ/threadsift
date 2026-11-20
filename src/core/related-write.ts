import { eq, sql } from "drizzle-orm";

import type { Database } from "./database.ts";
import { guardedOutcome } from "./guarded-outcome.ts";
import type { JobWrites, SettledOutcome } from "./job-outcome.ts";
import { loggedRelated } from "./log-writes.ts";
import { type Version, versionsHold } from "./related-input.ts";
import type { RelatedResult } from "./related-task.ts";
import { digests, items, relatedItems } from "./schema.ts";
import { STALE } from "./vault-stale.ts";

function replacedSet(db: Database, sourceId: number, picks: RelatedResult["picks"]): JobWrites {
  return [
    ...STALE.itemChanged(
      db,
      sql`${items.id} = ${sourceId} and (select json_group_array(json_object('item', ${relatedItems.relatedId}, 'reason', ${relatedItems.reason}) order by ${relatedItems.position}) from ${relatedItems} where ${relatedItems.itemId} = ${sourceId}) <> ${JSON.stringify(picks)}`,
    ),
    db.delete(relatedItems).where(eq(relatedItems.itemId, sourceId)),
    db.insert(relatedItems).select(
      db
        .select({
          itemId: sql<number>`${sourceId}`.as("item_id"),
          relatedId: sql<number>`json_extract(pick.value, '$.item')`.as("related_id"),
          position: sql<number>`pick.key`.as("position"),
          reason: sql<string>`json_extract(pick.value, '$.reason')`.as("reason"),
        })
        .from(sql`json_each(${JSON.stringify(picks)}) as pick`),
    ),
  ];
}

export function noDigestOutcome(db: Database, itemId: number): SettledOutcome {
  return guardedOutcome(
    db,
    sql`not exists (select 1 from ${digests} where ${digests.itemId} = ${itemId})`,
  );
}

export function closedOutcome(db: Database, source: Version): SettledOutcome {
  return guardedOutcome(db, versionsHold({ source, sent: [] }));
}

export function emptyOutcome(db: Database, source: Version): SettledOutcome {
  return guardedOutcome(db, versionsHold({ source, sent: [] }), {
    writes: replacedSet(db, source.id, []),
  });
}

export function pickedWrites(
  db: Database,
  sourceId: number,
  picks: RelatedResult["picks"],
): JobWrites {
  return [
    ...replacedSet(db, sourceId, picks),
    ...(picks.length === 0 ? [] : loggedRelated(db, sourceId, picks.length)),
  ];
}
