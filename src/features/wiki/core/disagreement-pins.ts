import { type SQL, type SQLWrapper, and, sql } from "drizzle-orm";

import type { Database } from "../../../core/kernel/database.ts";
import { currentDisagreementPin } from "../../../core/kernel/disagreement-sql.ts";
import { itemsDisagreeProposals, pins } from "../../../core/kernel/schema.ts";
import { among } from "../../../core/kernel/sql-expressions.ts";
import { pairKey } from "./proposal-candidates.ts";

export function pairPinned(first: Readonly<SQLWrapper>, second: Readonly<SQLWrapper>): SQL {
  return sql`exists (select 1 from ${pins} where ${currentDisagreementPin()} and ${pins.fromItemId} = min(${first}, ${second}) and ${pins.intoItemId} = max(${first}, ${second}))`;
}

export function pairStored(first: Readonly<SQLWrapper>, second: Readonly<SQLWrapper>): SQL {
  return sql`exists (select 1 from ${itemsDisagreeProposals} where min(${itemsDisagreeProposals.fromItemId}, ${itemsDisagreeProposals.intoItemId}) = min(${first}, ${second}) and max(${itemsDisagreeProposals.fromItemId}, ${itemsDisagreeProposals.intoItemId}) = max(${first}, ${second}))`;
}

export async function decidedPairs(db: Database, itemIds: readonly number[]): Promise<Set<string>> {
  const [rows, pinned] = await db.batch([
    db
      .select({ from: itemsDisagreeProposals.fromItemId, into: itemsDisagreeProposals.intoItemId })
      .from(itemsDisagreeProposals)
      .where(
        and(
          among(itemsDisagreeProposals.fromItemId, itemIds),
          among(itemsDisagreeProposals.intoItemId, itemIds),
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
    ...rows.map(({ from, into }) => pairKey(from, into)),
    ...pinned.map(({ key }) => key),
  ]);
}
