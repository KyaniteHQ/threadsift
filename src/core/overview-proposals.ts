import { and, asc, desc, eq, notExists, sql } from "drizzle-orm";

import { providerSet } from "./ai-tasks.ts";
import type { JobPorts } from "./job-outcome.ts";
import { WEEKLY_TASK } from "./kinds.ts";
import { startOverview } from "./overview-start.ts";
import type { Database } from "./ports.ts";
import { PROPOSALS_MAX } from "./proposal-candidates.ts";
import { proposals, topics } from "./schema.ts";
import { hasUncovered, overviewGap, uncoveredCount } from "./topic-coverage.ts";
import { claimedAt, claimingWeek } from "./weekly-claim.ts";

type OverviewGapAcceptance = "done" | "unknown" | "not-open" | "no-provider" | "not-current";

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
        .select({
          id: sql<null>`null`.as("id"),
          kind: sql<"overview-gap">`'overview-gap'`.as("kind"),
          fromTagId: sql<null>`null`.as("from_tag_id"),
          intoTagId: sql<null>`null`.as("into_tag_id"),
          fromTopicId: sql<null>`null`.as("from_topic_id"),
          intoTopicId: sql<null>`null`.as("into_topic_id"),
          reason: sql<string>`${PLAIN_CHECK}`.as("reason"),
          state: sql<"open">`'open'`.as("state"),
          createdAt: sql<number>`${now}`.as("created_at"),
          cursor: sql<null>`null`.as("cursor"),
          moved: sql<null>`null`.as("moved"),
          unitRevision: sql<null>`null`.as("unit_revision"),
          highlightId: sql<null>`null`.as("highlight_id"),
          topicId: sql<number>`${picked.id}`.as("topic_id"),
        })
        .from(picked)
        .where(sql`changes() > 0`)
        .orderBy(asc(picked.uncovered), desc(picked.id)),
    )
    .onConflictDoNothing();
}

function closedGaps(db: Database, now: number) {
  return db
    .delete(proposals)
    .where(
      and(
        claimedAt(WEEKLY_TASK["overview-gap"], now),
        eq(proposals.kind, "overview-gap"),
        eq(proposals.state, "open"),
        sql`not (${overviewGap(proposals.topicId)})`,
      ),
    );
}

export async function proposeOverviewGaps(db: Database, now: number): Promise<void> {
  await db.batch([
    claimingWeek(db, now, WEEKLY_TASK["overview-gap"]),
    insertedRows(db, now),
    closedGaps(db, now),
  ]);
}

function stillOpen(id: number, topicId: number) {
  return sql`exists (select 1 from ${proposals} where ${proposals.id} = ${id} and ${proposals.kind} = 'overview-gap' and ${proposals.state} = 'open' and ${proposals.topicId} = ${topicId}) and ${hasUncovered(topicId)}`;
}

async function refusalOf(db: Database, id: number) {
  const [row] = await db
    .select({
      state: proposals.state,
      provider: sql<number>`${providerSet()}`,
      current: sql<number>`${overviewGap(proposals.topicId)}`,
    })
    .from(proposals)
    .where(and(eq(proposals.id, id), eq(proposals.kind, "overview-gap")));

  if (row === undefined) return "unknown";

  if (row.state !== "open") return "not-open";

  if (row.provider !== 1) return "no-provider";

  return row.current === 1 ? "retry" : "not-current";
}

export async function acceptOverviewGap(
  ports: JobPorts,
  id: number,
): Promise<OverviewGapAcceptance> {
  const { db } = ports;

  const [row] = await db
    .select({ state: proposals.state, topicId: proposals.topicId })
    .from(proposals)
    .where(and(eq(proposals.id, id), eq(proposals.kind, "overview-gap")));

  if (row === undefined || row.topicId === null) return "unknown";

  if (row.state !== "open") return "not-open";

  const started = await startOverview(ports, row.topicId, {
    when: stillOpen(id, row.topicId),
    after: [db.delete(proposals).where(and(eq(proposals.id, id), sql`changes() > 0`))],
  });

  if (started) return "done";

  const refusal = await refusalOf(db, id);

  return refusal === "retry" ? acceptOverviewGap(ports, id) : refusal;
}
