import { type SQL, sql } from "drizzle-orm";

import type { MergeKind, ProposalState } from "../../../core/contract/proposal-contract.ts";
import type { Database } from "../../../core/kernel/database.ts";
import type { JobWrites } from "../../../core/kernel/job-outcome.ts";
import { MERGE } from "./merge-kinds.ts";
import { pairKey } from "./proposal-candidates.ts";
import { insertedProposals } from "./proposal-lifecycle.ts";
import type { Sent } from "./proposal-sent.ts";
import type { ProposalsResult } from "./proposal-task.ts";
import { storedField } from "./weekly-kind.ts";

interface StoredRow {
  readonly from: number;
  readonly into: number;
  readonly reason: string | null;
  readonly state: Extract<ProposalState, "open" | "declined">;
}

function rowsOf(sent: Sent, merges: ProposalsResult["merges"]): readonly StoredRow[] {
  const merged = new Set(merges.map(({ from, into }) => pairKey(from, into)));

  return [
    ...merges.map(({ from, into, reason }) => ({ from, into, reason, state: "open" as const })),
    ...sent.flatMap(({ low, high }) =>
      merged.has(pairKey(low.id, high.id))
        ? []
        : [{ from: low.id, into: high.id, reason: null, state: "declined" as const }],
    ),
  ];
}

export function sentExist(kind: MergeKind, sent: Sent): SQL {
  const ids = JSON.stringify(sent.flatMap(({ low, high }) => [low.id, high.id]));
  const { table } = MERGE[kind];

  return sql`not exists (select 1 from json_each(${ids}) as wanted where not exists (select 1 from ${table} where ${table.id} = wanted.value))`;
}

export function storedMerges(
  db: Database,
  kind: MergeKind,
  sent: Sent,
  merges: ProposalsResult["merges"],
): JobWrites {
  const rows = rowsOf(sent, merges);

  if (rows.length === 0) return [];

  const { subject, from, into, subjects } = MERGE[kind];
  const stored = { from: storedField("from"), into: storedField("into") };

  return insertedProposals(db, kind, Date.now(), {
    state: storedField("state"),
    reason: storedField("reason"),
    subjects: subjects(stored.from, stored.into),
    from: sql`json_each(${JSON.stringify(rows)}) as stored`,
    where: sql`not exists (select 1 from ${subject} where min(${from}, ${into}) = min(${stored.from}, ${stored.into}) and max(${from}, ${into}) = max(${stored.from}, ${stored.into}))`,
    order: sql`stored.key`,
  });
}
