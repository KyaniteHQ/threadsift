import { TAG_KIND, closingWrites } from "./catalog-key-links.ts";
import { catalogKey } from "./catalog-key.ts";
import { loggedMerge } from "./log-writes.ts";
import type { PlanUnit } from "./merge-unit.ts";
import { repointedPins } from "./pins.ts";
import { pins } from "./schema.ts";
import { REWRITE_UNIT_ITEMS, readRewrite } from "./tag-rewrite.ts";

export const planTagUnit: PlanUnit = async (db, id, row) => {
  const from = { id: row.from.id, key: catalogKey(row.from.name), name: row.from.name };
  const { into } = row;
  const unit = await readRewrite(db, { from, into, after: row.cursor ?? 0 });
  const reachedEnd = unit.itemIds.length < REWRITE_UNIT_ITEMS;

  return {
    leases: [],
    moving: unit.moving,
    pin: [
      db
        .insert(pins)
        .values({
          kind: "tag-merge",
          fromKey: from.key,
          fromName: from.name,
          intoTagId: into.id,
          createdAt: Date.now(),
        })
        .onConflictDoNothing(),
      repointedPins(db, from.id, into.id),
    ],
    moves: unit.writes,
    cursor: reachedEnd ? 0 : unit.last,
    closing: closingWrites(db, TAG_KIND, from.id, [
      loggedMerge(db, {
        action: "merge",
        proposalId: id,
        mergedFrom: from.name,
        mergedInto: into.name,
        when: TAG_KIND.unlinked(db, from.id),
      }),
    ]),
    opening: null,
  };
};
