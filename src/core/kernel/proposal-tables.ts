import { type SQL, sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { MERGE_KINDS, PROPOSAL_KINDS, PROPOSAL_STATES } from "../contract/proposal-contract.ts";
import { tags, topics } from "./catalog-tables.ts";
import { highlights } from "./highlight-tables.ts";
import { items } from "./item-tables.ts";
import { listed, literal } from "./schema-checks.ts";

export const proposals = sqliteTable(
  "proposals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind", { enum: PROPOSAL_KINDS }).notNull(),
    reason: text("reason"),
    state: text("state", { enum: PROPOSAL_STATES }).notNull(),
    createdAt: integer("created_at").notNull(),
    cursor: integer("cursor"),
    moved: integer("moved"),
    unitRevision: integer("unit_revision"),
    failedRuns: integer("failed_runs"),
  },
  (table) => [
    check(
      "proposals_accepting_check",
      sql`${table.state} = 'accepting' or (${table.cursor} is null and ${table.moved} is null and ${table.unitRevision} is null and ${table.failedRuns} is null)`,
    ),
    check(
      "proposals_state_check",
      sql`${table.state} not in ('accepting', 'declined') or ${table.kind} in (${listed(MERGE_KINDS)})`,
    ),
    check(
      "proposals_values_check",
      sql`${table.kind} in (${listed(PROPOSAL_KINDS)}) and ${table.state} in (${listed(PROPOSAL_STATES)})`,
    ),
    check(
      "proposals_open_reason",
      sql`${table.state} <> 'open' or length(coalesce(${table.reason}, '')) > 0`,
    ),
    uniqueIndex("proposals_id_kind").on(table.id, table.kind),
    index("proposals_state").on(table.state, table.id),
  ],
);

const subjectKey = () => ({
  proposalId: integer("proposal_id").primaryKey(),
  kind: text("kind", { enum: PROPOSAL_KINDS }).notNull(),
});

const PROPOSAL_PARENT: [AnySQLiteColumn, AnySQLiteColumn] = [proposals.id, proposals.kind];

export const tagMergeProposals = sqliteTable(
  "tag_merge_proposals",
  {
    ...subjectKey(),
    fromTagId: integer("from_tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    intoTagId: integer("into_tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    check("tag_merge_proposals_kind", sql`${table.kind} = ${literal("tag-merge")}`),
    foreignKey({ columns: [table.proposalId, table.kind], foreignColumns: PROPOSAL_PARENT }),
    check("tag_merge_proposals_distinct", sql`${table.fromTagId} <> ${table.intoTagId}`),
    index("tag_merge_proposals_from").on(table.fromTagId),
    index("tag_merge_proposals_into").on(table.intoTagId),
  ],
);

export const topicMergeProposals = sqliteTable(
  "topic_merge_proposals",
  {
    ...subjectKey(),
    fromTopicId: integer("from_topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    intoTopicId: integer("into_topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
  },
  (table) => [
    check("topic_merge_proposals_kind", sql`${table.kind} = ${literal("topic-merge")}`),
    foreignKey({ columns: [table.proposalId, table.kind], foreignColumns: PROPOSAL_PARENT }),
    check("topic_merge_proposals_distinct", sql`${table.fromTopicId} <> ${table.intoTopicId}`),
    index("topic_merge_proposals_from").on(table.fromTopicId),
    index("topic_merge_proposals_into").on(table.intoTopicId),
  ],
);

export const highlightLostProposals = sqliteTable(
  "highlight_lost_proposals",
  {
    ...subjectKey(),
    highlightId: integer("highlight_id")
      .notNull()
      .references(() => highlights.id, { onDelete: "cascade" }),
  },
  (table) => [
    check("highlight_lost_proposals_kind", sql`${table.kind} = ${literal("highlight-lost")}`),
    foreignKey({ columns: [table.proposalId, table.kind], foreignColumns: PROPOSAL_PARENT }),
    uniqueIndex("highlight_lost_proposals_highlight").on(table.highlightId),
  ],
);

export const overviewGapProposals = sqliteTable(
  "overview_gap_proposals",
  {
    ...subjectKey(),
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
  },
  (table) => [
    check("overview_gap_proposals_kind", sql`${table.kind} = ${literal("overview-gap")}`),
    foreignKey({ columns: [table.proposalId, table.kind], foreignColumns: PROPOSAL_PARENT }),
    uniqueIndex("overview_gap_proposals_topic").on(table.topicId),
  ],
);

export const itemsDisagreeProposals = sqliteTable(
  "items_disagree_proposals",
  {
    ...subjectKey(),
    fromItemId: integer("from_item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    intoItemId: integer("into_item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    fromDigest: integer("from_digest").notNull(),
    intoDigest: integer("into_digest").notNull(),
  },
  (table) => [
    check("items_disagree_proposals_kind", sql`${table.kind} = ${literal("items-disagree")}`),
    foreignKey({ columns: [table.proposalId, table.kind], foreignColumns: PROPOSAL_PARENT }),
    check("items_disagree_proposals_distinct", sql`${table.fromItemId} <> ${table.intoItemId}`),
    index("items_disagree_proposals_from").on(table.fromItemId),
    index("items_disagree_proposals_into").on(table.intoItemId),
  ],
);

export const SUBJECT_TABLE = {
  "tag-merge": tagMergeProposals,
  "topic-merge": topicMergeProposals,
  "highlight-lost": highlightLostProposals,
  "overview-gap": overviewGapProposals,
  "items-disagree": itemsDisagreeProposals,
} as const;

export function hasSubject(): SQL {
  const tables = Object.values(SUBJECT_TABLE).map(
    (table) => sql`select ${table.proposalId} from ${table}`,
  );

  return sql`${proposals.id} in (${sql.join(tables, sql` union all `)})`;
}
