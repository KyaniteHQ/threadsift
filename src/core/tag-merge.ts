import type { UnitContext, UnitPlan } from "./merge-unit.ts";
import { REWRITE_UNIT_ITEMS, readRewrite } from "./tag-rewrite.ts";

export async function planTagUnit({
  db,
  from,
  into,
  cursor,
}: Readonly<UnitContext>): Promise<UnitPlan> {
  const unit = await readRewrite(db, { from, into, after: cursor ?? 0 });
  const reachedEnd = unit.itemIds.length < REWRITE_UNIT_ITEMS;

  return {
    moving: unit.moving,
    moves: unit.writes,
    cursor: reachedEnd ? 0 : unit.last,
    before: [],
    wakes: [],
  };
}
