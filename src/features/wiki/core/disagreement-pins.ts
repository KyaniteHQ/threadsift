import { type SQL, type SQLWrapper, and, eq, sql } from "drizzle-orm";

import type { Database } from "../../../core/kernel/database.ts";
import { currentDisagreementPin } from "../../../core/kernel/disagreement-sql.ts";
import { pins, proposals } from "../../../core/kernel/schema.ts";
import { among } from "../../../core/kernel/sql-expressions.ts";
import { pairKey } from "./proposal-candidates.ts";

export function pairPinned(first: Readonly<SQLWrapper>, second: Readonly<SQLWrapper>): SQL {
  return sql`exists (select 1 from ${pins} where ${currentDisagreementPin()} and ${pins.fromItemId} = min(${first}, ${second}) and ${pins.intoItemId} = max(${first}, ${second}))`;
}

export async function decidedPairs(db: Database, itemIds: readonly number[]): Promise<Set<string>> {
  const [rows, pinned] = await db.batch([
    db
      .select({ from: proposals.fromItemId, into: proposals.intoItemId })
      .from(proposals)
      .where(
        and(
          eq(proposals.kind, "items-disagree"),
          among(proposals.fromItemId, itemIds),
          among(proposals.intoItemId, itemIds),
        ),
      ),
    db
      .select({ key: pins.fromKey })
      .from(pins)
      .where(
        and(
          currentDisagreementPin(),
          among(pins.fromItemId, itemIds),
          among(pins.intoItemId, itemIds),
        ),
      ),
  ]);

  return new Set([
    ...rows.flatMap(({ from, into }) =>
      from === null || into === null ? [] : [pairKey(from, into)],
    ),
    ...pinned.map(({ key }) => key),
  ]);
}
