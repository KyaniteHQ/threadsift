import { sql } from "drizzle-orm";

import { TOPIC_KIND, topicClosingWrites, topicMoves } from "./catalog-key-links.ts";
import { among } from "./guards.ts";
import { loggedMerge } from "./log-writes.ts";
import type { PlanUnit } from "./merge-unit.ts";
import { mergePinWrites } from "./pins.ts";
import { items } from "./schema.ts";

export const planTopicUnit: PlanUnit = async (db, id, row) => {
  const from = { id: row.from.id, name: row.from.name };
  const into = { id: row.into.id, name: row.into.name };
  const moves = await TOPIC_KIND.linked(db, from.id);

  const closing = topicClosingWrites(db, from.id, into.id, [
    loggedMerge(db, {
      action: "merge-topic",
      proposalId: id,
      mergedFrom: from.name,
      mergedInto: into.name,
      when: TOPIC_KIND.unlinked(db, from.id),
    }),
  ]);

  return {
    moving: sql`(select count(*) from ${items} where ${items.topicId} = ${from.id} and ${among(items.id, moves.itemIds)})`,
    pin: mergePinWrites(db, {
      kind: "topic-merge",
      fromName: from.name,
      loser: from.id,
      survivor: into.id,
    }),
    moves: topicMoves(db, from.id, into.id, moves),
    cursor: null,
    closing,
  };
};
