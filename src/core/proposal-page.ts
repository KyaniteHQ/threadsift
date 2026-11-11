import { type SQLWrapper, and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { ITEMS_PAGE_SIZE } from "./item-page.ts";
import type { Database } from "./ports.ts";
import { ListedStateSchema, type ProposalPage } from "./proposal-contract.ts";
import { itemTags, proposals, scheduledRuns, settings, tags } from "./schema.ts";

export type Rejection = "rejected" | "unknown" | "not-open";

const fromTag = alias(tags, "from_tag");

const intoTag = alias(tags, "into_tag");

function itemsWith(tagId: Readonly<SQLWrapper>) {
  return sql<number>`(select count(*) from ${itemTags} where ${itemTags.tagId} = ${tagId})`;
}

function pageQuery(db: Database, cursor: number | null) {
  return db
    .select({
      id: proposals.id,
      kind: proposals.kind,
      reason: proposals.reason,
      state: proposals.state,
      fromId: sql<number>`${fromTag.id}`.as("from_id"),
      fromName: sql<string>`${fromTag.name}`.as("from_name"),
      fromItems: itemsWith(fromTag.id).as("from_items"),
      intoId: sql<number>`${intoTag.id}`.as("into_id"),
      intoName: sql<string>`${intoTag.name}`.as("into_name"),
      intoItems: itemsWith(intoTag.id).as("into_items"),
    })
    .from(proposals)
    .innerJoin(fromTag, eq(fromTag.id, proposals.fromTagId))
    .innerJoin(intoTag, eq(intoTag.id, proposals.intoTagId))
    .where(
      and(
        inArray(proposals.state, ListedStateSchema.options),
        cursor === null ? undefined : lt(proposals.id, cursor),
      ),
    )
    .orderBy(desc(proposals.id))
    .limit(ITEMS_PAGE_SIZE + 1);
}

export async function readProposalPage(db: Database, cursor: number | null): Promise<ProposalPage> {
  const [rows, [run], saved] = await db.batch([
    pageQuery(db, cursor),
    db
      .select({ at: scheduledRuns.lastRunAt })
      .from(scheduledRuns)
      .where(eq(scheduledRuns.task, "proposals")),
    db.select({ id: settings.id }).from(settings).where(eq(settings.id, 1)),
  ]);

  const shown = rows.slice(0, ITEMS_PAGE_SIZE);
  const last = shown.at(-1);

  return {
    proposals: shown.map((row) => ({
      id: row.id,
      kind: row.kind,
      state: ListedStateSchema.parse(row.state),
      reason: row.reason ?? "",
      from: { id: row.fromId, name: row.fromName, items: row.fromItems },
      into: { id: row.intoId, name: row.intoName, items: row.intoItems },
    })),
    checkedAt: run?.at ?? null,
    provider: saved.length > 0,
    next: rows.length > shown.length && last !== undefined ? String(last.id) : null,
  };
}

export async function rejectProposal(db: Database, id: number): Promise<Rejection> {
  const moved = await db
    .update(proposals)
    .set({ state: "rejected" })
    .where(and(eq(proposals.id, id), eq(proposals.state, "open")))
    .returning({ id: proposals.id });

  if (moved.length > 0) return "rejected";

  const [found] = await db.select({ id: proposals.id }).from(proposals).where(eq(proposals.id, id));

  return found === undefined ? "unknown" : "not-open";
}
