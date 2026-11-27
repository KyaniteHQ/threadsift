import { eq, sql } from "drizzle-orm";

import type { Database } from "../../../core/kernel/database.ts";
import { currentDisagreementPin } from "../../../core/kernel/disagreement-sql.ts";
import { heldOffBatch } from "../../../core/kernel/restore-hold.ts";
import { itemsDisagreeProposals, pins, proposals } from "../../../core/kernel/schema.ts";
import { STALE } from "../../../core/kernel/vault-stale.ts";
import { DISAGREEMENT } from "./disagreement-rows.ts";
import { pairKey } from "./proposal-candidates.ts";
import { removedOpen } from "./proposal-lifecycle.ts";

type DisagreementAcceptance = "done" | "unknown" | "not-open" | "not-current" | "restoring";

interface Side {
  readonly item: number;
  readonly digest: number;
}

function stillCurrent(id: number) {
  return sql`exists (select 1 from ${proposals} join ${itemsDisagreeProposals} on ${itemsDisagreeProposals.proposalId} = ${proposals.id} where ${proposals.id} = ${id} and ${proposals.state} = 'open' and ${DISAGREEMENT.accepts})`;
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

function sidesOf(row: Readonly<typeof itemsDisagreeProposals.$inferSelect>): readonly [Side, Side] {
  const first = { item: row.fromItemId, digest: row.fromDigest };
  const second = { item: row.intoItemId, digest: row.intoDigest };

  return first.item < second.item ? [first, second] : [second, first];
}

export async function acceptDisagreement(
  db: Database,
  id: number,
): Promise<DisagreementAcceptance> {
  const [row] = await db
    .select({
      state: proposals.state,
      reason: proposals.reason,
      subject: itemsDisagreeProposals,
      current: sql<number>`${DISAGREEMENT.accepts}`,
    })
    .from(proposals)
    .innerJoin(itemsDisagreeProposals, eq(itemsDisagreeProposals.proposalId, proposals.id))
    .where(eq(proposals.id, id));

  if (row === undefined) return "unknown";

  if (row.state !== "open") return "not-open";

  const sides = sidesOf(row.subject);
  const { reason } = row;

  if (row.current === 0 || reason === null) return "not-current";

  const accepted = await heldOffBatch(db, stillCurrent(id), [
    keptPair(db, reason, sides),
    ...STALE.disagreementAccepted(db, sides[0].item),
    removedOpen(db, "items-disagree", eq(proposals.id, id)),
  ]);

  if (accepted === "restoring") return accepted;

  return accepted === "written" ? "done" : "not-current";
}
