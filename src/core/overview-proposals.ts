import { and, asc, desc, eq, notExists, sql } from "drizzle-orm";

import { plainCheckRow, plainCheckWeek } from "./plain-check-week.ts";
import type { Database } from "./ports.ts";
import { PROPOSALS_MAX } from "./proposal-candidates.ts";
import { proposals, topics } from "./schema.ts";
import { overviewGap, uncoveredCount } from "./topic-coverage.ts";

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
        .select(plainCheckRow("overview-gap", now, { topicId: sql<number>`${picked.id}` }))
        .from(picked)
        .where(sql`changes() > 0`)
        .orderBy(asc(picked.uncovered), desc(picked.id)),
    )
    .onConflictDoNothing();
}

export async function proposeOverviewGaps(db: Database, now: number): Promise<void> {
  await plainCheckWeek(db, now, "overview-gap", {
    inserted: insertedRows(db, now),
    closedWhen: sql`not (${overviewGap(proposals.topicId)})`,
  });
}
