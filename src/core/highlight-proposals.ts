import { and, asc, desc, eq, exists, inArray, ne, notExists, sql } from "drizzle-orm";

import { guardedResults } from "./guards.ts";
import { removalWrites } from "./highlights.ts";
import { WEEKLY_TASK } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { PROPOSALS_MAX } from "./proposal-candidates.ts";
import { highlights, proposals, scheduledRuns } from "./schema.ts";
import { claimingWeek } from "./weekly-claim.ts";

type LostHighlightAcceptance = "done" | "unknown" | "not-open" | "not-current";

const PLAIN_CHECK = "plain-check";

function newestWithoutRow(db: Database) {
  return db
    .select({ id: highlights.id })
    .from(highlights)
    .where(
      and(
        ne(highlights.status, "attached"),
        notExists(
          db
            .select({ one: sql`1` })
            .from(proposals)
            .where(eq(proposals.highlightId, highlights.id)),
        ),
      ),
    )
    .orderBy(desc(highlights.id))
    .limit(PROPOSALS_MAX);
}

function insertedRows(db: Database, now: number) {
  return db
    .insert(proposals)
    .select(
      db
        .select({
          id: sql<null>`null`.as("id"),
          kind: sql<"highlight-lost">`'highlight-lost'`.as("kind"),
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
          highlightId: sql<number>`${highlights.id}`.as("highlight_id"),
          topicId: sql<null>`null`.as("topic_id"),
        })
        .from(highlights)
        .where(and(inArray(highlights.id, newestWithoutRow(db)), sql`changes() > 0`))
        .orderBy(asc(highlights.id)),
    )
    .onConflictDoNothing();
}

function foundAgain(db: Database, now: number) {
  return db
    .delete(proposals)
    .where(
      and(
        sql`exists (select 1 from ${scheduledRuns} where ${scheduledRuns.task} = ${WEEKLY_TASK["highlight-lost"]} and ${scheduledRuns.lastRunAt} = ${now})`,
        eq(proposals.kind, "highlight-lost"),
        eq(proposals.state, "open"),
        inArray(
          proposals.highlightId,
          db
            .select({ id: highlights.id })
            .from(highlights)
            .where(eq(highlights.status, "attached")),
        ),
      ),
    );
}

export async function proposeLostHighlights(db: Database, now: number): Promise<void> {
  await db.batch([
    claimingWeek(db, now, WEEKLY_TASK["highlight-lost"]),
    insertedRows(db, now),
    foundAgain(db, now),
  ]);
}

function stillLost(db: Database, id: number) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(proposals)
      .innerJoin(highlights, eq(highlights.id, proposals.highlightId))
      .where(
        and(eq(proposals.id, id), eq(proposals.state, "open"), ne(highlights.status, "attached")),
      ),
  );
}

export async function acceptLostHighlight(
  db: Database,
  id: number,
): Promise<LostHighlightAcceptance> {
  const [row] = await db
    .select({
      state: proposals.state,
      highlightId: highlights.id,
      itemId: highlights.itemId,
      status: highlights.status,
    })
    .from(proposals)
    .innerJoin(highlights, eq(highlights.id, proposals.highlightId))
    .where(eq(proposals.id, id));

  if (row === undefined) return "unknown";

  if (row.state !== "open") return "not-open";

  if (row.status === "attached") return "not-current";

  const removed = await guardedResults(
    db,
    stillLost(db, id),
    removalWrites(db, row.itemId, row.highlightId),
  );

  return removed === null ? acceptLostHighlight(db, id) : "done";
}
