import { z } from "zod";

import type { Instance } from "./instance.ts";

const PairSchema = z.object({
  item_id: z.number(),
  related_id: z.number(),
  position: z.number(),
  reason: z.string(),
});

export function pairsOf(instance: Instance, itemId: number) {
  return instance.database.rows(
    PairSchema,
    "select item_id, related_id, position, reason from related_items where item_id = ? order by position",
    itemId,
  );
}

export function seedPair(
  instance: Instance,
  source: number,
  related: number,
  position: number,
  reason: string,
): void {
  instance.database.exec(
    "insert into related_items (item_id, related_id, position, reason) values (?, ?, ?, ?)",
    source,
    related,
    position,
    reason,
  );
}
