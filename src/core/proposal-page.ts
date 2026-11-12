import { type SQLWrapper, and, desc, eq, inArray, lt, max, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import {
  disagreementHolds,
  firstDigest,
  firstItem,
  secondDigest,
  secondItem,
} from "./disagreement-rows.ts";
import { ITEMS_PAGE_SIZE } from "./item-page.ts";
import { itemTitle } from "./item-title.ts";
import { PROPOSAL_KINDS, type ProposalKind, WEEKLY_TASK } from "./kinds.ts";
import type { Database } from "./ports.ts";
import {
  ListedStateSchema,
  type Proposal,
  type ProposalPage,
  ProposalSchema,
} from "./proposal-contract.ts";
import {
  digests,
  highlights,
  itemTags,
  items,
  knownProposal,
  proposals,
  scheduledRuns,
  settings,
  tags,
  topics,
} from "./schema.ts";
import { digestedCount, overviewGap, uncoveredCount } from "./topic-coverage.ts";

export type Rejection = "rejected" | "unknown" | "not-open";

const fromTag = alias(tags, "from_tag");

const intoTag = alias(tags, "into_tag");

const fromTopic = alias(topics, "from_topic");

const intoTopic = alias(topics, "into_topic");

const subjectTopic = alias(topics, "subject_topic");

function nameOf(tag: Readonly<SQLWrapper>, topic: Readonly<SQLWrapper>) {
  return sql<string>`coalesce(${tag}, ${topic})`;
}

function itemsWith(tagId: Readonly<SQLWrapper>, topicId: Readonly<SQLWrapper>) {
  return sql<
    number | null
  >`case ${proposals.kind} when 'tag-merge' then (select count(*) from ${itemTags} where ${itemTags.tagId} = ${tagId}) when 'topic-merge' then (select count(*) from ${items} where ${items.topicId} = ${topicId}) end`;
}

const LISTED_WHILE = {
  "tag-merge": undefined,
  "topic-merge": undefined,
  "highlight-lost": ne(highlights.status, "attached"),
  "overview-gap": overviewGap(proposals.topicId),
  "items-disagree": disagreementHolds(),
} as const satisfies Readonly<Record<ProposalKind, SQLWrapper | undefined>>;

const listable = or(
  ...PROPOSAL_KINDS.map((kind) => and(eq(proposals.kind, kind), LISTED_WHILE[kind])),
);

function sideColumns(
  prefix: string,
  { id, title, stored }: Readonly<Record<"id" | "title" | "stored", Readonly<SQLWrapper>>>,
) {
  return {
    id: sql<number | null>`${id}`.as(`${prefix}_id`),
    title: sql<string | null>`${title}`.as(`${prefix}_title`),
    summary: sql<string | null>`json_extract(${stored}, '$.summary')`.as(`${prefix}_summary`),
  };
}

const PAGE_COLUMNS = {
  id: proposals.id,
  kind: proposals.kind,
  reason: proposals.reason,
  state: proposals.state,
  fromId: sql<number | null>`coalesce(${fromTag.id}, ${fromTopic.id})`.as("from_id"),
  fromName: nameOf(fromTag.name, fromTopic.name).as("from_name"),
  fromItems: itemsWith(fromTag.id, fromTopic.id).as("from_items"),
  intoId: sql<number | null>`coalesce(${intoTag.id}, ${intoTopic.id})`.as("into_id"),
  intoName: nameOf(intoTag.name, intoTopic.name).as("into_name"),
  intoItems: itemsWith(intoTag.id, intoTopic.id).as("into_items"),
  highlightId: sql<number | null>`${highlights.id}`.as("highlight_id"),
  quote: sql<string | null>`${highlights.exact}`.as("quote"),
  itemId: sql<number | null>`${items.id}`.as("item_id"),
  source: sql<string | null>`${items.source}`.as("source"),
  title: itemTitle().as("title"),
  topicKey: sql<string | null>`${subjectTopic.key}`.as("topic_key"),
  topicName: sql<string | null>`${subjectTopic.name}`.as("topic_name"),
  first: sideColumns("first", {
    id: firstItem.id,
    title: firstDigest.title,
    stored: firstDigest.digest,
  }),
  second: sideColumns("second", {
    id: secondItem.id,
    title: secondDigest.title,
    stored: secondDigest.digest,
  }),
  uncovered: sql<number>`${uncoveredCount(proposals.topicId)}`.as("uncovered"),
  digested: sql<number>`${digestedCount(proposals.topicId)}`.as("digested"),
};

function pageQuery(db: Database, cursor: number | null) {
  return db
    .select(PAGE_COLUMNS)
    .from(proposals)
    .leftJoin(fromTag, eq(fromTag.id, proposals.fromTagId))
    .leftJoin(intoTag, eq(intoTag.id, proposals.intoTagId))
    .leftJoin(fromTopic, eq(fromTopic.id, proposals.fromTopicId))
    .leftJoin(intoTopic, eq(intoTopic.id, proposals.intoTopicId))
    .leftJoin(firstItem, eq(firstItem.id, proposals.fromItemId))
    .leftJoin(
      firstDigest,
      and(eq(firstDigest.itemId, firstItem.id), eq(firstDigest.taskId, proposals.fromDigest)),
    )
    .leftJoin(secondItem, eq(secondItem.id, proposals.intoItemId))
    .leftJoin(
      secondDigest,
      and(eq(secondDigest.itemId, secondItem.id), eq(secondDigest.taskId, proposals.intoDigest)),
    )
    .leftJoin(
      subjectTopic,
      eq(subjectTopic.id, sql`coalesce(${proposals.topicId}, ${firstItem.topicId})`),
    )
    .leftJoin(highlights, eq(highlights.id, proposals.highlightId))
    .leftJoin(items, eq(items.id, highlights.itemId))
    .leftJoin(digests, eq(digests.itemId, items.id))
    .where(
      and(
        inArray(proposals.state, ListedStateSchema.options),
        listable,
        cursor === null ? undefined : lt(proposals.id, cursor),
      ),
    )
    .orderBy(desc(proposals.id))
    .limit(ITEMS_PAGE_SIZE + 1);
}

type Row = Awaited<ReturnType<typeof pageQuery>>[number];

function mergeOf(row: Readonly<Row>) {
  return ProposalSchema.parse({
    id: row.id,
    kind: row.kind,
    state: row.state,
    reason: row.reason ?? "",
    from: { id: row.fromId, name: row.fromName, items: row.fromItems },
    into: { id: row.intoId, name: row.intoName, items: row.intoItems },
  });
}

function lostOf(row: Readonly<Row>) {
  return ProposalSchema.parse({
    id: row.id,
    kind: row.kind,
    state: row.state,
    highlight: {
      id: row.highlightId,
      quote: row.quote,
      item: { id: row.itemId, source: row.source, title: row.title },
    },
  });
}

function gapOf(row: Readonly<Row>) {
  return ProposalSchema.parse({
    id: row.id,
    kind: row.kind,
    state: row.state,
    topic: {
      key: row.topicKey,
      name: row.topicName,
      uncovered: row.uncovered,
      items: row.digested,
    },
  });
}

function disagreeOf(row: Readonly<Row>) {
  return ProposalSchema.parse({
    id: row.id,
    kind: row.kind,
    state: row.state,
    reason: row.reason ?? "",
    topic: { key: row.topicKey, name: row.topicName },
    first: row.first,
    second: row.second,
  });
}

const PROPOSAL_OF = {
  "tag-merge": mergeOf,
  "topic-merge": mergeOf,
  "highlight-lost": lostOf,
  "overview-gap": gapOf,
  "items-disagree": disagreeOf,
} as const satisfies Readonly<Record<ProposalKind, (row: Readonly<Row>) => Proposal>>;

export async function readProposalPage(db: Database, cursor: number | null): Promise<ProposalPage> {
  const [rows, [run], saved] = await db.batch([
    pageQuery(db, cursor),
    db
      .select({ at: max(scheduledRuns.lastRunAt) })
      .from(scheduledRuns)
      .where(inArray(scheduledRuns.task, Object.values(WEEKLY_TASK))),
    db.select({ id: settings.id }).from(settings).where(eq(settings.id, 1)),
  ]);

  const shown = rows.slice(0, ITEMS_PAGE_SIZE);
  const last = shown.at(-1);

  return {
    proposals: shown.map((row) => PROPOSAL_OF[row.kind](row)),
    checkedAt: run?.at ?? null,
    provider: saved.length > 0,
    next: rows.length > shown.length && last !== undefined ? String(last.id) : null,
  };
}

export async function rejectProposal(db: Database, id: number): Promise<Rejection> {
  const moved = await db
    .update(proposals)
    .set({ state: "rejected" })
    .where(and(eq(proposals.id, id), knownProposal, eq(proposals.state, "open")))
    .returning({ id: proposals.id });

  if (moved.length > 0) return "rejected";

  const [found] = await db
    .select({ id: proposals.id })
    .from(proposals)
    .where(and(eq(proposals.id, id), knownProposal));

  return found === undefined ? "unknown" : "not-open";
}
