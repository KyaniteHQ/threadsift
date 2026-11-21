import { desc, eq, sql } from "drizzle-orm";

import type { MergeKind } from "../../../core/contract/proposal-contract.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { proposals } from "../../../core/kernel/schema.ts";
import { acceptMerge } from "./merge-accept.ts";
import { MERGE } from "./merge-kinds.ts";
import type { MergeKindSpec } from "./merge-unit.ts";
import { HEAD_COLUMNS, PAGE_ROWS, listedAfter } from "./proposal-rows.ts";
import { modelCheck } from "./weekly-check.ts";

function mergeSide(spec: Readonly<MergeKindSpec>, end: "from" | "into") {
  const { table, itemLink } = spec;
  const id = spec[end];

  return {
    id: sql<number>`${id}`.as(`${end}_id`),
    name: sql<string>`(select ${table.name} from ${table} where ${table.id} = ${id})`.as(
      `${end}_name`,
    ),
    items:
      sql<number>`(select count(${itemLink.item}) from ${itemLink.entry.table} where ${itemLink.entry} = ${id})`.as(
        `${end}_items`,
      ),
  };
}

function mergePage(kind: MergeKind, db: Database, cursor: number | null) {
  const spec: MergeKindSpec = MERGE[kind];

  return db
    .select({
      ...HEAD_COLUMNS,
      fromId: mergeSide(spec, "from").id,
      fromName: mergeSide(spec, "from").name,
      fromItems: mergeSide(spec, "from").items,
      intoId: mergeSide(spec, "into").id,
      intoName: mergeSide(spec, "into").name,
      intoItems: mergeSide(spec, "into").items,
    })
    .from(proposals)
    .innerJoin(spec.subject, eq(spec.subject.proposalId, proposals.id))
    .where(listedAfter(kind, cursor))
    .orderBy(desc(proposals.id))
    .limit(PAGE_ROWS);
}

type MergePageRow = Awaited<ReturnType<typeof mergePage>>[number];

export function mergeProposal<Kind extends MergeKind>(kind: Kind) {
  return {
    stage: MERGE[kind].stage,
    accept: (ports: Parameters<typeof acceptMerge>[0], id: number) => acceptMerge(ports, id, kind),
    page: (db: Database, cursor: number | null) => mergePage(kind, db, cursor),
    pageEntry: (row: Readonly<MergePageRow>) => ({
      id: row.id,
      kind,
      state: row.state,
      reason: row.reason ?? "",
      failedRuns: row.failedRuns,
      from: { id: row.fromId, name: row.fromName, items: row.fromItems },
      into: { id: row.intoId, name: row.intoName, items: row.intoItems },
    }),
    weekly: modelCheck(kind),
  };
}
