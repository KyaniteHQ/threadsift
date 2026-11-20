import { type SQLWrapper, and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import type { Database } from "./database.ts";
import { firstDigest, firstItem, secondDigest, secondItem } from "./disagreement-rows.ts";
import { ITEMS_PAGE_SIZE } from "./item-page.ts";
import { itemTitle } from "./item-title.ts";
import { acrossKinds } from "./merge-kinds.ts";
import { ListedStateSchema } from "./proposal-contract.ts";
import { digests, highlights, items, proposals, topics } from "./schema.ts";
import { digestedCount, uncoveredCount } from "./topic-coverage.ts";

const subjectTopic = alias(topics, "subject_topic");

function mergeSide(end: "from" | "into") {
  return {
    id: acrossKinds<number | null>((spec) => spec[end]),
    name: acrossKinds<string>(
      ({ table, ...spec }) =>
        sql`(select ${table.name} from ${table} where ${table.id} = ${spec[end]})`,
    ),
    items: acrossKinds<number | null>(
      ({ itemLink, ...spec }) =>
        sql`case when ${spec[end]} is null then null else (select count(${itemLink.item}) from ${itemLink.entry.table} where ${itemLink.entry} = ${spec[end]}) end`,
    ),
  };
}

const FROM = mergeSide("from");

const INTO = mergeSide("into");

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
  failedRuns: sql<number>`coalesce(${proposals.failedRuns}, 0)`.as("failed_runs"),
  fromId: FROM.id.as("from_id"),
  fromName: FROM.name.as("from_name"),
  fromItems: FROM.items.as("from_items"),
  intoId: INTO.id.as("into_id"),
  intoName: INTO.name.as("into_name"),
  intoItems: INTO.items.as("into_items"),
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

export type PageRow = Awaited<ReturnType<typeof pageQuery>>[number];

export function pageQuery(
  db: Database,
  cursor: number | null,
  listable: Readonly<SQLWrapper> | undefined,
) {
  return db
    .select(PAGE_COLUMNS)
    .from(proposals)
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
