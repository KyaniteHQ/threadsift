import { and, eq, inArray, max, or, sql } from "drizzle-orm";

import type { Database } from "./database.ts";
import { PAGE_SIZE, pageTail } from "./paging.ts";
import { PROPOSAL_KINDS, type ProposalState, WEEKLY_TASK } from "./proposal-contract.ts";
import { PROPOSAL } from "./proposal-kinds.ts";
import { pageQuery } from "./proposal-rows.ts";
import { providerSet } from "./provider-saved.ts";
import { proposals, scheduledRuns } from "./schema.ts";

const LISTABLE = or(
  ...PROPOSAL_KINDS.map((kind) => and(eq(proposals.kind, kind), PROPOSAL[kind].listedWhile)),
);

export async function readProposalPage(db: Database, cursor: number | null) {
  const [rows, [run], [provider]] = await db.batch([
    pageQuery(db, cursor, LISTABLE),
    db
      .select({ at: max(scheduledRuns.lastRunAt) })
      .from(scheduledRuns)
      .where(inArray(scheduledRuns.task, Object.values(WEEKLY_TASK))),
    db.select({ set: sql<number>`${providerSet()}` }).from(sql`(select 1)`),
  ]);

  const { items, next } = pageTail(rows, PAGE_SIZE, ({ id }) => String(id));

  return {
    proposals: items.map((row) => PROPOSAL[row.kind].pageEntry(row)),
    checkedAt: run?.at ?? null,
    provider: provider?.set === 1,
    next,
  };
}

export async function readProposalState(
  db: Database,
  id: number,
): Promise<ProposalState | undefined> {
  const [row] = await db
    .select({ state: proposals.state })
    .from(proposals)
    .where(eq(proposals.id, id));

  return row?.state;
}
