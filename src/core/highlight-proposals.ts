import { and, asc, desc, eq, exists, inArray, ne, notExists, sql } from "drizzle-orm";

import { guardedResults } from "./guards.ts";
import { removalWrites } from "./highlights.ts";
import { WEEKLY_TASK } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { PROPOSALS_MAX } from "./proposal-candidates.ts";
import { proposalRow } from "./proposal-row.ts";
import { highlights, proposals } from "./schema.ts";
import { claimedAt, claimingWeek } from "./weekly-claim.ts";

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
        .select(
          proposalRow(
            {
              kind: "highlight-lost",
              state: sql`'open'`,
              reason: sql`${PLAIN_CHECK}`,
              createdAt: now,
            },
            { highlightId: sql<number>`${highlights.id}` },
          ),
        )
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
        claimedAt(WEEKLY_TASK["highlight-lost"], now),
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
