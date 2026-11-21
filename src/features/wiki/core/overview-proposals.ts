import { and, asc, desc, eq, notExists, sql } from "drizzle-orm";

import type { Database } from "../../../core/kernel/database.ts";
import { overviewGapProposals, proposals, topics } from "../../../core/kernel/schema.ts";
import { acceptOverviewGap } from "./overview-accept.ts";
import type { ProposalKindSpec } from "./proposal-kind.ts";
import { HEAD_COLUMNS, PAGE_ROWS, listedAfter } from "./proposal-rows.ts";
import { digestedCount, overviewGap, uncoveredCount } from "./topic-coverage.ts";
import { type PlainRows, plainCheck } from "./weekly-check.ts";

const OVERVIEW_GAPS_PER_WEEK = 20;

const GAP = overviewGap(overviewGapProposals.topicId);

function mostBehind(db: Database) {
  return db
    .select({ id: topics.id, uncovered: sql<number>`${uncoveredCount(topics.id)}`.as("uncovered") })
    .from(topics)
    .where(
      and(
        overviewGap(topics.id),
        notExists(
          db
            .select({ one: sql`1` })
            .from(overviewGapProposals)
            .where(eq(overviewGapProposals.topicId, topics.id)),
        ),
      ),
    )
    .orderBy(desc(sql`uncovered`), asc(topics.id))
    .limit(OVERVIEW_GAPS_PER_WEEK)
    .as("most_behind");
}

function proposedRows(db: Database): PlainRows<"overview-gap"> {
  const picked = mostBehind(db);

  return {
    subjects: { topicId: picked.id },
    from: picked,
    where: undefined,
    order: sql`${picked.uncovered} asc, ${picked.id} desc`,
  };
}

function gapPage(db: Database, cursor: number | null) {
  return db
    .select({
      ...HEAD_COLUMNS,
      topicKey: topics.key,
      topicName: topics.name,
      uncovered: sql<number>`${uncoveredCount(topics.id)}`.as("uncovered"),
      digested: sql<number>`${digestedCount(topics.id)}`.as("digested"),
    })
    .from(proposals)
    .innerJoin(overviewGapProposals, eq(overviewGapProposals.proposalId, proposals.id))
    .innerJoin(topics, eq(topics.id, overviewGapProposals.topicId))
    .where(listedAfter("overview-gap", cursor, GAP))
    .orderBy(desc(proposals.id))
    .limit(PAGE_ROWS);
}

type GapRow = Awaited<ReturnType<typeof gapPage>>[number];

function gapOf(row: Readonly<GapRow>) {
  return {
    id: row.id,
    kind: "overview-gap" as const,
    state: row.state,
    topic: {
      key: row.topicKey,
      name: row.topicName,
      uncovered: row.uncovered,
      items: row.digested,
    },
  };
}

export const OVERVIEW_GAP = {
  stage: "overview-proposals",
  accept: acceptOverviewGap,
  page: gapPage,
  pageEntry: gapOf,
  weekly: plainCheck("overview-gap", {
    proposed: proposedRows,
    closedWhen: () => sql`not (${GAP})`,
  }),
} satisfies ProposalKindSpec<"overview-gap">;
