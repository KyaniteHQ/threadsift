import { sql } from "drizzle-orm";

import { wokenBotWaits } from "../../../core/kernel/job-waiting.ts";
import { items } from "../../../core/kernel/schema.ts";
import { among } from "../../../core/kernel/sql-expressions.ts";
import { STALE } from "../../../core/kernel/vault-stale.ts";
import type { UnitContext, UnitPlan } from "./merge-unit.ts";
import { topicLinked, topicMoves } from "./topic-moves.ts";
import { continuingOverview, overviewJobsFollow, overviewRemoved } from "./topic-overview-run.ts";

export async function planTopicUnit({
  db,
  from,
  into,
  gone,
}: Readonly<UnitContext>): Promise<UnitPlan> {
  const linked = await topicLinked(db, from.id);

  return {
    moving: sql`(select count(*) from ${items} where ${items.topicId} = ${from.id} and ${among(items.id, linked.itemIds)})`,
    moves: [
      ...topicMoves(db, from.id, into.id, linked),
      overviewRemoved(db, from.id, gone),
      ...overviewJobsFollow(db, { loser: from.id, survivor: into.id }, gone),
    ],
    cursor: null,
    before: [
      ...STALE.topicMerged(db, { from: from.id, gone }),
      wokenBotWaits(db, { moved: { kind: "library" }, now: Date.now(), when: gone }),
    ],
    wakes: [continuingOverview(db, into.id, gone)],
  };
}
