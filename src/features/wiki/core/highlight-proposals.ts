import { and, desc, eq, exists, inArray, ne, not, notExists, sql } from "drizzle-orm";

import type { Database } from "../../../core/kernel/database.ts";
import { guardedResults } from "../../../core/kernel/guards.ts";
import { itemTitle } from "../../../core/kernel/item-title.ts";
import type { JobPorts } from "../../../core/kernel/job-outcome.ts";
import {
  digests,
  highlightLostProposals,
  highlights,
  items,
  proposals,
} from "../../../core/kernel/schema.ts";
import { removalWrites } from "../../item/core/highlights.ts";
import type { ProposalKindSpec } from "./proposal-kind.ts";
import { HEAD_COLUMNS, PAGE_ROWS, listedAfter } from "./proposal-rows.ts";
import { type PlainRows, plainCheck } from "./weekly-check.ts";

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
            .from(highlightLostProposals)
            .where(eq(highlightLostProposals.highlightId, highlights.id)),
        ),
      ),
    )
    .orderBy(desc(highlights.id))
    .limit(LOST_HIGHLIGHTS_PER_WEEK);
}

function proposedRows(db: Database): PlainRows<"highlight-lost"> {
  return {
    subjects: { highlightId: highlights.id },
    from: highlights,
    where: inArray(highlights.id, newestWithoutRow(db)),
    order: sql`${highlights.id}`,
  };
}

function attachedAgain(db: Database) {
  return inArray(
    highlightLostProposals.highlightId,
    db.select({ id: highlights.id }).from(highlights).where(not(LOST)),
  );
}

function stillLost(db: Database, id: number) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(proposals)
      .innerJoin(highlightLostProposals, eq(highlightLostProposals.proposalId, proposals.id))
      .innerJoin(highlights, eq(highlights.id, highlightLostProposals.highlightId))
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
    .innerJoin(highlightLostProposals, eq(highlightLostProposals.proposalId, proposals.id))
    .innerJoin(highlights, eq(highlights.id, highlightLostProposals.highlightId))
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

function lostPage(db: Database, cursor: number | null) {
  return db
    .select({
      ...HEAD_COLUMNS,
      highlightId: sql<number>`${highlights.id}`.as("highlight_id"),
      quote: sql<string>`${highlights.exact}`.as("quote"),
      itemId: sql<number>`${items.id}`.as("item_id"),
      source: items.source,
      title: itemTitle().as("title"),
    })
    .from(proposals)
    .innerJoin(highlightLostProposals, eq(highlightLostProposals.proposalId, proposals.id))
    .innerJoin(highlights, eq(highlights.id, highlightLostProposals.highlightId))
    .innerJoin(items, eq(items.id, highlights.itemId))
    .leftJoin(digests, eq(digests.itemId, items.id))
    .where(listedAfter("highlight-lost", cursor, LOST))
    .orderBy(desc(proposals.id))
    .limit(PAGE_ROWS);
}

type LostRow = Awaited<ReturnType<typeof lostPage>>[number];

function lostOf(row: Readonly<LostRow>) {
  return {
    id: row.id,
    kind: "highlight-lost" as const,
    state: row.state,
    highlight: {
      id: row.highlightId,
      quote: row.quote,
      item: { id: row.itemId, source: row.source, title: row.title },
    },
  };
}

export const LOST_HIGHLIGHT = {
  stage: "highlight-proposals",
  accept: ({ db }: Readonly<JobPorts>, id: number) => acceptLostHighlight(db, id),
  page: lostPage,
  pageEntry: lostOf,
  weekly: plainCheck("highlight-lost", { proposed: proposedRows, closedWhen: attachedAgain }),
} satisfies ProposalKindSpec<"highlight-lost">;
