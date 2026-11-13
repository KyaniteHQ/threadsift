import { and, asc, desc, eq, exists, inArray, ne, notExists, sql } from "drizzle-orm";

import { guardedResults } from "./guards.ts";
import { removalWrites } from "./highlights.ts";
import { plainCheckRow, plainCheckWeek } from "./plain-check-week.ts";
import type { Database } from "./ports.ts";
import { PROPOSALS_MAX } from "./proposal-candidates.ts";
import { highlights, proposals } from "./schema.ts";

type LostHighlightAcceptance = "done" | "unknown" | "not-open" | "not-current";

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
          plainCheckRow("highlight-lost", now, { highlightId: sql<number>`${highlights.id}` }),
        )
        .from(highlights)
        .where(and(inArray(highlights.id, newestWithoutRow(db)), sql`changes() > 0`))
        .orderBy(asc(highlights.id)),
    )
    .onConflictDoNothing();
}

function attachedAgain(db: Database) {
  return inArray(
    proposals.highlightId,
    db.select({ id: highlights.id }).from(highlights).where(eq(highlights.status, "attached")),
  );
}

export async function proposeLostHighlights(db: Database, now: number): Promise<void> {
  await plainCheckWeek(db, now, "highlight-lost", {
    inserted: insertedRows(db, now),
    closedWhen: attachedAgain(db),
  });
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
