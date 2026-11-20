import { sql } from "drizzle-orm";

import type { Database } from "./database.ts";
import type { JobWrites } from "./job-outcome.ts";
import type { MergeKind } from "./kinds.ts";
import { MERGE } from "./merge-kinds.ts";
import { pairKey } from "./proposal-candidates.ts";
import { type InsertedState, proposalRow } from "./proposal-lifecycle.ts";
import type { ProposalsResult, Sent } from "./proposal-task.ts";
import { proposals } from "./schema.ts";
import { storedField } from "./weekly-kind.ts";

interface StoredRow {
  readonly from: number;
  readonly into: number;
  readonly reason: string | null;
  readonly state: InsertedState<MergeKind>;
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

export function storedMerges(
  db: Database,
  kind: MergeKind,
  sent: Sent,
  merges: ProposalsResult["merges"],
): JobWrites {
  const rows = rowsOf(sent, merges);

  if (rows.length === 0) return [];

  const { subjects } = MERGE[kind];

  return [
    db
      .insert(proposals)
      .select(
        db
          .select(
            proposalRow(
              {
                kind,
                state: storedField("state"),
                reason: storedField("reason"),
                createdAt: Date.now(),
              },
              subjects(storedField("from"), storedField("into")),
            ),
          )
          .from(sql`json_each(${JSON.stringify(rows)}) as stored`)
          .where(sql`true`),
      )
      .onConflictDoNothing(),
  ];
}
