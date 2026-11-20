import { and, asc, desc, eq, notExists, sql } from "drizzle-orm";

import type { Database } from "../kernel/database.ts";
import { proposals, topics } from "../kernel/schema.ts";
import { acceptOverviewGap } from "./overview-accept.ts";
import type { ProposalKindSpec } from "./proposal-kind.ts";
import type { PageRow } from "./proposal-rows.ts";
import { overviewGap, uncoveredCount } from "./topic-coverage.ts";
import { type PlainRow, plainCheck } from "./weekly-check.ts";

const OVERVIEW_GAPS_PER_WEEK = 20;

const GAP = overviewGap(proposals.topicId);

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
            .from(proposals)
            .where(and(eq(proposals.kind, "overview-gap"), eq(proposals.topicId, topics.id))),
        ),
      ),
    )
    .orderBy(desc(sql`uncovered`), asc(topics.id))
    .limit(OVERVIEW_GAPS_PER_WEEK)
    .as("most_behind");
}

function insertedRows(db: Database, row: PlainRow<"overview-gap">) {
  const picked = mostBehind(db);

  return db
    .insert(proposals)
    .select(
      db
        .select(row({ topicId: sql<number>`${picked.id}` }))
        .from(picked)
        .where(sql`changes() > 0`)
        .orderBy(asc(picked.uncovered), desc(picked.id)),
    )
    .onConflictDoNothing();
}

function gapOf(row: Readonly<PageRow>) {
  return {
    id: row.id,
    kind: row.kind,
    state: row.state,
    topic: {
      key: row.topicKey,
      name: row.topicName,
      uncovered: row.uncovered,
      items: row.digested,
    },
  };
}

export const OVERVIEW_GAP: ProposalKindSpec<"overview-gap"> = {
  stage: "overview-proposals",
  accept: acceptOverviewGap,
  listedWhile: GAP,
  pageEntry: gapOf,
  weekly: plainCheck("overview-gap", {
    inserted: insertedRows,
    closedWhen: () => sql`not (${GAP})`,
  }),
};
