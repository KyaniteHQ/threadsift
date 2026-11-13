import { and, asc, desc, eq, notExists, sql } from "drizzle-orm";

import { WEEKLY_TASK } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { PROPOSALS_MAX } from "./proposal-candidates.ts";
import { proposalRow, removedOpen } from "./proposal-lifecycle.ts";
import { proposals, topics } from "./schema.ts";
import { overviewGap, uncoveredCount } from "./topic-coverage.ts";
import { claimedAt, claimingWeek } from "./weekly-claim.ts";

const PLAIN_CHECK = "plain-check";

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
    .limit(PROPOSALS_MAX)
    .as("most_behind");
}

function insertedRows(db: Database, now: number) {
  const picked = mostBehind(db);

  return db
    .insert(proposals)
    .select(
      db
        .select(
          proposalRow(
            {
              kind: "overview-gap",
              state: sql`'open'`,
              reason: sql`${PLAIN_CHECK}`,
              createdAt: now,
            },
            { topicId: sql<number>`${picked.id}` },
          ),
        )
        .from(picked)
        .where(sql`changes() > 0`)
        .orderBy(asc(picked.uncovered), desc(picked.id)),
    )
    .onConflictDoNothing();
}

function closedGaps(db: Database, now: number) {
  return removedOpen(
    db,
    claimedAt(WEEKLY_TASK["overview-gap"], now),
    eq(proposals.kind, "overview-gap"),
    sql`not (${overviewGap(proposals.topicId)})`,
  );
}

export async function proposeOverviewGaps(db: Database, now: number): Promise<void> {
  await db.batch([
    claimingWeek(db, now, WEEKLY_TASK["overview-gap"]),
    insertedRows(db, now),
    closedGaps(db, now),
  ]);
}
