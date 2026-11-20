import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { MERGE_KINDS, PROPOSAL_KINDS, PROPOSAL_STATES } from "../contract/proposal-contract.ts";
import { tags, topics } from "./catalog-tables.ts";
import { highlights } from "./highlight-tables.ts";
import { items } from "./item-tables.ts";
import { listed, subjectsForKind } from "./schema-checks.ts";

export const SUBJECTS = {
  "tag-merge": ["fromTagId", "intoTagId"],
  "topic-merge": ["fromTopicId", "intoTopicId"],
  "highlight-lost": ["highlightId"],
  "overview-gap": ["topicId"],
  "items-disagree": ["fromItemId", "intoItemId", "fromDigest", "intoDigest"],
} as const;

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
    failedRuns: integer("failed_runs"),
    highlightId: integer("highlight_id").references(() => highlights.id, { onDelete: "cascade" }),
    topicId: integer("topic_id").references(() => topics.id, { onDelete: "cascade" }),
    fromItemId: integer("from_item_id").references(() => items.id, { onDelete: "cascade" }),
    intoItemId: integer("into_item_id").references(() => items.id, { onDelete: "cascade" }),
    fromDigest: integer("from_digest"),
    intoDigest: integer("into_digest"),
  },
  (table) => {
    const subject = subjectsForKind(table.kind, table, SUBJECTS);

    return [
      check(
        "proposals_accepting_check",
        sql`${table.state} = 'accepting' or (${table.cursor} is null and ${table.moved} is null and ${table.unitRevision} is null and ${table.failedRuns} is null)`,
      ),
      check(
        "proposals_state_check",
        sql`${table.state} not in ('accepting', 'declined') or ${table.kind} in (${listed(MERGE_KINDS)})`,
      ),
      check(
        "proposals_subject_check",
        sql`${subject} and (${table.kind} <> 'items-disagree' or ${table.fromItemId} <> ${table.intoItemId})`,
      ),
      check(
        "proposals_values_check",
        sql`${table.kind} in (${listed(PROPOSAL_KINDS)}) and ${table.state} in (${listed(PROPOSAL_STATES)})`,
      ),
      uniqueIndex("proposals_highlight").on(table.highlightId),
      uniqueIndex("proposals_overview_topic").on(table.topicId),
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
    ];
  },
);
