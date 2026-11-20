import { sql } from "drizzle-orm";

import { among } from "./guards.ts";
import type { UnitContext, UnitPlan } from "./merge-unit.ts";
import { items, topics } from "./schema.ts";
import { topicLinked, topicMoves } from "./topic-moves.ts";
import { continuingOverview, overviewRemoved } from "./topic-overview-run.ts";
import { queueVaultIndex, queueVaultTopics } from "./vault-queue.ts";

export async function planTopicUnit({
  db,
  from,
  into,
  gone,
}: Readonly<UnitContext>): Promise<UnitPlan> {
  const linked = await topicLinked(db, from.id);

  return {
    moving: sql`(select count(*) from ${items} where ${items.topicId} = ${from.id} and ${among(items.id, linked.itemIds)})`,
    moves: [...topicMoves(db, from.id, into.id, linked), overviewRemoved(db, from.id, gone)],
    cursor: null,
    before: [
      queueVaultTopics(db, sql`${topics.id} = ${from.id} and ${gone}`),
      queueVaultIndex(db, gone),
    ],
    wakes: [continuingOverview(db, into.id, gone)],
  };
}
