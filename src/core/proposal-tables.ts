import { inArray, sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { highlights } from "./highlight-tables.ts";
import { PROPOSAL_KINDS, PROPOSAL_STATES } from "./kinds.ts";
import { items, tags, topics } from "./schema.ts";

export const proposals = sqliteTable(
  "proposals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind", { enum: PROPOSAL_KINDS }).notNull(),
    fromTagId: integer("from_tag_id").references(() => tags.id, { onDelete: "cascade" }),
    intoTagId: integer("into_tag_id").references(() => tags.id, { onDelete: "cascade" }),
    fromTopicId: integer("from_topic_id").references(() => topics.id, { onDelete: "cascade" }),
    intoTopicId: integer("into_topic_id").references(() => topics.id, { onDelete: "cascade" }),
    reason: text("reason"),
    state: text("state", { enum: PROPOSAL_STATES }).notNull(),
    createdAt: integer("created_at").notNull(),
    cursor: integer("cursor"),
    moved: integer("moved"),
    unitRevision: integer("unit_revision"),
    highlightId: integer("highlight_id").references(() => highlights.id, { onDelete: "cascade" }),
    topicId: integer("topic_id").references(() => topics.id, { onDelete: "cascade" }),
    fromItemId: integer("from_item_id").references(() => items.id, { onDelete: "cascade" }),
    intoItemId: integer("into_item_id").references(() => items.id, { onDelete: "cascade" }),
    fromDigest: integer("from_digest"),
    intoDigest: integer("into_digest"),
  },
  (table) => [
    uniqueIndex("proposals_pair").on(
      sql`min(${table.fromTagId}, ${table.intoTagId})`,
      sql`max(${table.fromTagId}, ${table.intoTagId})`,
    ),
    uniqueIndex("proposals_topic_pair").on(
      sql`min(${table.fromTopicId}, ${table.intoTopicId})`,
      sql`max(${table.fromTopicId}, ${table.intoTopicId})`,
    ),
    uniqueIndex("proposals_highlight").on(table.highlightId),
    uniqueIndex("proposals_overview_topic").on(table.topicId),
    uniqueIndex("proposals_item_pair").on(
      sql`min(${table.fromItemId}, ${table.intoItemId})`,
      sql`max(${table.fromItemId}, ${table.intoItemId})`,
    ),
    index("proposals_from").on(table.fromTagId),
    index("proposals_into").on(table.intoTagId),
    index("proposals_from_topic").on(table.fromTopicId),
    index("proposals_into_topic").on(table.intoTopicId),
    index("proposals_from_item").on(table.fromItemId),
    index("proposals_into_item").on(table.intoItemId),
    index("proposals_state").on(table.state, table.id),
    check("proposals_distinct", sql`${table.fromTagId} <> ${table.intoTagId}`),
    check("proposals_topic_distinct", sql`${table.fromTopicId} <> ${table.intoTopicId}`),
    check(
      "proposals_open_reason",
      sql`${table.state} <> 'open' or length(coalesce(${table.reason}, '')) > 0`,
    ),
  ],
);

export const knownProposal = inArray(proposals.kind, [...PROPOSAL_KINDS]);
