import { and, eq, sql } from "drizzle-orm";

import { currentDisagreementPin } from "./disagreement-pins.ts";
import { DISAGREEMENT } from "./disagreement-rows.ts";
import { guardedResults } from "./guards.ts";
import type { Database } from "./ports.ts";
import { pairKey } from "./proposal-candidates.ts";
import { removedOpen } from "./proposal-lifecycle.ts";
import { pins, proposals } from "./schema.ts";

type DisagreementAcceptance = "done" | "unknown" | "not-open" | "not-current";

interface Side {
  readonly item: number;
  readonly digest: number;
}

function stillCurrent(id: number) {
  return sql`exists (select 1 from ${proposals} where ${proposals.id} = ${id} and ${proposals.kind} = 'items-disagree' and ${proposals.state} = 'open' and ${DISAGREEMENT.accepts})`;
}

function keptPair(db: Database, reason: string, [low, high]: readonly [Side, Side]) {
  return db
    .insert(pins)
    .values({
      kind: "items-disagree",
      fromKey: pairKey(low.item, high.item),
      fromName: reason,
      fromItemId: low.item,
      intoItemId: high.item,
      fromDigest: low.digest,
      intoDigest: high.digest,
      createdAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: [pins.kind, pins.fromKey],
      set: {
        fromName: sql`excluded.from_name`,
        fromItemId: sql`excluded.from_item_id`,
        intoItemId: sql`excluded.into_item_id`,
        fromDigest: sql`excluded.from_digest`,
        intoDigest: sql`excluded.into_digest`,
        createdAt: sql`excluded.created_at`,
      },
      setWhere: sql`not (${currentDisagreementPin()})`,
    });
}

function sidesOf(row: Readonly<typeof proposals.$inferSelect>): readonly [Side, Side] | null {
  const { fromItemId, intoItemId, fromDigest, intoDigest } = row;

  if (fromItemId === null || intoItemId === null || fromDigest === null || intoDigest === null)
    return null;

  const first = { item: fromItemId, digest: fromDigest };
  const second = { item: intoItemId, digest: intoDigest };

  return first.item < second.item ? [first, second] : [second, first];
}

export async function acceptDisagreement(
  db: Database,
  id: number,
): Promise<DisagreementAcceptance> {
  const [row] = await db
    .select({ proposal: proposals, current: sql<number>`${DISAGREEMENT.accepts}` })
    .from(proposals)
    .where(and(eq(proposals.id, id), eq(proposals.kind, "items-disagree")));

  if (row === undefined) return "unknown";

  if (row.proposal.state !== "open") return "not-open";

  const sides = sidesOf(row.proposal);
  const { reason } = row.proposal;

  if (row.current === 0 || sides === null || reason === null) return "not-current";

  const accepted = await guardedResults(db, stillCurrent(id), [
    keptPair(db, reason, sides),
    removedOpen(db, eq(proposals.id, id)),
  ]);

  return accepted === null ? acceptDisagreement(db, id) : "done";
}
