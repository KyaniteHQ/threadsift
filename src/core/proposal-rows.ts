import { type SQLWrapper, and, desc, eq, inArray, lt, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import {
  DISAGREEMENT,
  firstDigest,
  firstItem,
  secondDigest,
  secondItem,
} from "./disagreement-rows.ts";
import { ITEMS_PAGE_SIZE } from "./item-page.ts";
import { itemTitle } from "./item-title.ts";
import { PROPOSAL_KINDS, type ProposalKind } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { ListedStateSchema } from "./proposal-contract.ts";
import { digests, highlights, itemTags, items, proposals, tags, topics } from "./schema.ts";
import { overviewGap, digestedCount, uncoveredCount } from "./topic-coverage.ts";

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
  "items-disagree": DISAGREEMENT.listed,
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

export function pageQuery(db: Database, cursor: number | null) {
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
