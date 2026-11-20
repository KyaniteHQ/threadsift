import { acceptMerge } from "./merge-accept.ts";
import { MERGE } from "./merge-kinds.ts";
import type { MergeKind } from "./proposal-contract.ts";
import type { PageRow } from "./proposal-rows.ts";
import { modelCheck } from "./weekly-check.ts";

function mergeOf(row: Readonly<PageRow>) {
  return {
    id: row.id,
    kind: row.kind,
    state: row.state,
    reason: row.reason ?? "",
    failedRuns: row.failedRuns,
    from: { id: row.fromId, name: row.fromName, items: row.fromItems },
    into: { id: row.intoId, name: row.intoName, items: row.intoItems },
  };
}

export function mergeProposal<Kind extends MergeKind>(kind: Kind) {
  return {
    stage: MERGE[kind].stage,
    accept: acceptMerge,
    listedWhile: undefined,
    pageEntry: mergeOf,
    weekly: modelCheck(kind),
  };
}
