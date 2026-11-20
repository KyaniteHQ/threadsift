import { and, asc, desc, eq, exists, inArray, ne, not, notExists, sql } from "drizzle-orm";

import type { Database } from "../../../core/kernel/database.ts";
import { guardedResults } from "../../../core/kernel/guards.ts";
import { highlights, proposals } from "../../../core/kernel/schema.ts";
import { removalWrites } from "../../item/core/highlights.ts";
import type { ProposalKindSpec } from "./proposal-kind.ts";
import type { PageRow } from "./proposal-rows.ts";
import { type PlainRow, plainCheck } from "./weekly-check.ts";

type LostHighlightAcceptance = "done" | "unknown" | "not-open" | "not-current";

const LOST_HIGHLIGHTS_PER_WEEK = 20;

const LOST = ne(highlights.status, "attached");

function newestWithoutRow(db: Database) {
  return db
    .select({ id: highlights.id })
    .from(highlights)
    .where(
      and(
        LOST,
        notExists(
          db
            .select({ one: sql`1` })
            .from(proposals)
            .where(eq(proposals.highlightId, highlights.id)),
        ),
      ),
    )
    .orderBy(desc(highlights.id))
    .limit(LOST_HIGHLIGHTS_PER_WEEK);
}

function insertedRows(db: Database, row: PlainRow<"highlight-lost">) {
  return db
    .insert(proposals)
    .select(
      db
        .select(row({ highlightId: sql<number>`${highlights.id}` }))
        .from(highlights)
        .where(and(inArray(highlights.id, newestWithoutRow(db)), sql`changes() > 0`))
        .orderBy(asc(highlights.id)),
    )
    .onConflictDoNothing();
}

function attachedAgain(db: Database) {
  return inArray(
    proposals.highlightId,
    db.select({ id: highlights.id }).from(highlights).where(not(LOST)),
  );
}

function stillLost(db: Database, id: number) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(proposals)
      .innerJoin(highlights, eq(highlights.id, proposals.highlightId))
      .where(and(eq(proposals.id, id), eq(proposals.state, "open"), LOST)),
  );
}

async function acceptLostHighlight(db: Database, id: number): Promise<LostHighlightAcceptance> {
  const [row] = await db
    .select({
      state: proposals.state,
      highlightId: highlights.id,
      itemId: highlights.itemId,
      lost: sql<number>`${LOST}`,
    })
    .from(proposals)
    .innerJoin(highlights, eq(highlights.id, proposals.highlightId))
    .where(eq(proposals.id, id));

  if (row === undefined) return "unknown";

  if (row.state !== "open") return "not-open";

  if (row.lost === 0) return "not-current";

  const removed = await guardedResults(
    db,
    stillLost(db, id),
    removalWrites(db, row.itemId, row.highlightId),
  );

  return removed === null ? "not-current" : "done";
}

function lostOf(row: Readonly<PageRow>) {
  return {
    id: row.id,
    kind: row.kind,
    state: row.state,
    highlight: {
      id: row.highlightId,
      quote: row.quote,
      item: { id: row.itemId, source: row.source, title: row.title },
    },
  };
}

export const LOST_HIGHLIGHT: ProposalKindSpec<"highlight-lost"> = {
  stage: "highlight-proposals",
  accept: ({ db }, id) => acceptLostHighlight(db, id),
  listedWhile: LOST,
  pageEntry: lostOf,
  weekly: plainCheck("highlight-lost", { inserted: insertedRows, closedWhen: attachedAgain }),
};
