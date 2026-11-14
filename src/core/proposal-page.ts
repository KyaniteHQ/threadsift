import { max, inArray, sql } from "drizzle-orm";

import { ITEMS_PAGE_SIZE } from "./item-page.ts";
import { type ProposalKind, WEEKLY_TASK } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { type Proposal, type ProposalPage, ProposalSchema } from "./proposal-contract.ts";
import { pageQuery } from "./proposal-rows.ts";
import { providerSet } from "./provider-saved.ts";
import { scheduledRuns } from "./schema.ts";

type Row = Awaited<ReturnType<typeof pageQuery>>[number];

function mergeOf(row: Readonly<Row>) {
  return ProposalSchema.parse({
    id: row.id,
    kind: row.kind,
    state: row.state,
    reason: row.reason ?? "",
    from: { id: row.fromId, name: row.fromName, items: row.fromItems },
    into: { id: row.intoId, name: row.intoName, items: row.intoItems },
  });
}

function lostOf(row: Readonly<Row>) {
  return ProposalSchema.parse({
    id: row.id,
    kind: row.kind,
    state: row.state,
    highlight: {
      id: row.highlightId,
      quote: row.quote,
      item: { id: row.itemId, source: row.source, title: row.title },
    },
  });
}

function gapOf(row: Readonly<Row>) {
  return ProposalSchema.parse({
    id: row.id,
    kind: row.kind,
    state: row.state,
    topic: {
      key: row.topicKey,
      name: row.topicName,
      uncovered: row.uncovered,
      items: row.digested,
    },
  });
}

function disagreeOf(row: Readonly<Row>) {
  return ProposalSchema.parse({
    id: row.id,
    kind: row.kind,
    state: row.state,
    reason: row.reason ?? "",
    topic: { key: row.topicKey, name: row.topicName },
    first: row.first,
    second: row.second,
  });
}

const PROPOSAL_OF = {
  "tag-merge": mergeOf,
  "topic-merge": mergeOf,
  "highlight-lost": lostOf,
  "overview-gap": gapOf,
  "items-disagree": disagreeOf,
} as const satisfies Readonly<Record<ProposalKind, (row: Readonly<Row>) => Proposal>>;

export async function readProposalPage(db: Database, cursor: number | null): Promise<ProposalPage> {
  const [rows, [run], [provider]] = await db.batch([
    pageQuery(db, cursor),
    db
      .select({ at: max(scheduledRuns.lastRunAt) })
      .from(scheduledRuns)
      .where(inArray(scheduledRuns.task, Object.values(WEEKLY_TASK))),
    db.select({ set: sql<number>`${providerSet()}` }).from(sql`(select 1)`),
  ]);

  const shown = rows.slice(0, ITEMS_PAGE_SIZE);
  const last = shown.at(-1);

  return {
    proposals: shown.map((row) => PROPOSAL_OF[row.kind](row)),
    checkedAt: run?.at ?? null,
    provider: provider?.set === 1,
    next: rows.length > shown.length && last !== undefined ? String(last.id) : null,
  };
}
