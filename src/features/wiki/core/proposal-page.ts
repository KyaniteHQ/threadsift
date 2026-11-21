import { and, eq, inArray, max, sql } from "drizzle-orm";

import { PAGE_SIZE, pageTail } from "../../../core/contract/paging.ts";
import { type ProposalState, WEEKLY_TASK } from "../../../core/contract/proposal-contract.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { providerSet } from "../../../core/kernel/provider-saved.ts";
import { hasSubject, proposals, scheduledRuns } from "../../../core/kernel/schema.ts";
import { PROPOSAL } from "./proposal-kinds.ts";

export async function readProposalPage(db: Database, cursor: number | null) {
  const [tagMerges, topicMerges, lost, gaps, disagreements, [run], [provider]] = await db.batch([
    PROPOSAL["tag-merge"].page(db, cursor),
    PROPOSAL["topic-merge"].page(db, cursor),
    PROPOSAL["highlight-lost"].page(db, cursor),
    PROPOSAL["overview-gap"].page(db, cursor),
    PROPOSAL["items-disagree"].page(db, cursor),
    db
      .select({ at: max(scheduledRuns.lastRunAt) })
      .from(scheduledRuns)
      .where(inArray(scheduledRuns.task, Object.values(WEEKLY_TASK))),
    db.select({ set: sql<number>`${providerSet()}` }).from(sql`(select 1)`),
  ]);

  const entries = [
    ...tagMerges.map((row) => PROPOSAL["tag-merge"].pageEntry(row)),
    ...topicMerges.map((row) => PROPOSAL["topic-merge"].pageEntry(row)),
    ...lost.map((row) => PROPOSAL["highlight-lost"].pageEntry(row)),
    ...gaps.map((row) => PROPOSAL["overview-gap"].pageEntry(row)),
    ...disagreements.map((row) => PROPOSAL["items-disagree"].pageEntry(row)),
  ].toSorted((a, b) => b.id - a.id);

  const { items, next } = pageTail(entries, PAGE_SIZE, ({ id }) => String(id));

  return {
    proposals: items,
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
    .where(and(eq(proposals.id, id), hasSubject()));

  return row?.state;
}
