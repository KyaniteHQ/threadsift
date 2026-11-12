import { type SQLWrapper, and, desc, eq, inArray, lt, max, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { ITEMS_PAGE_SIZE } from "./item-page.ts";
import type { Database } from "./ports.ts";
import { ListedStateSchema, type ProposalPage } from "./proposal-contract.ts";
import { itemTags, items, proposals, scheduledRuns, settings, tags, topics } from "./schema.ts";

export type Rejection = "rejected" | "unknown" | "not-open";

const fromTag = alias(tags, "from_tag");

const intoTag = alias(tags, "into_tag");

const fromTopic = alias(topics, "from_topic");

const intoTopic = alias(topics, "into_topic");

const WEEKLY_TASKS = ["proposals", "topic_proposals"];

function nameOf(tag: Readonly<SQLWrapper>, topic: Readonly<SQLWrapper>) {
  return sql<string>`coalesce(${tag}, ${topic})`;
}

function itemsWith(tagId: Readonly<SQLWrapper>, topicId: Readonly<SQLWrapper>) {
  return sql<number>`case when ${proposals.kind} = 'tag-merge' then (select count(*) from ${itemTags} where ${itemTags.tagId} = ${tagId}) else (select count(*) from ${items} where ${items.topicId} = ${topicId}) end`;
}

function pageQuery(db: Database, cursor: number | null) {
  return db
    .select({
      id: proposals.id,
      kind: proposals.kind,
      reason: proposals.reason,
      state: proposals.state,
      fromId: sql<number>`coalesce(${fromTag.id}, ${fromTopic.id})`.as("from_id"),
      fromName: nameOf(fromTag.name, fromTopic.name).as("from_name"),
      fromItems: itemsWith(fromTag.id, fromTopic.id).as("from_items"),
      intoId: sql<number>`coalesce(${intoTag.id}, ${intoTopic.id})`.as("into_id"),
      intoName: nameOf(intoTag.name, intoTopic.name).as("into_name"),
      intoItems: itemsWith(intoTag.id, intoTopic.id).as("into_items"),
    })
    .from(proposals)
    .leftJoin(fromTag, eq(fromTag.id, proposals.fromTagId))
    .leftJoin(intoTag, eq(intoTag.id, proposals.intoTagId))
    .leftJoin(fromTopic, eq(fromTopic.id, proposals.fromTopicId))
    .leftJoin(intoTopic, eq(intoTopic.id, proposals.intoTopicId))
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
      .select({ at: max(scheduledRuns.lastRunAt) })
      .from(scheduledRuns)
      .where(inArray(scheduledRuns.task, WEEKLY_TASKS)),
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
