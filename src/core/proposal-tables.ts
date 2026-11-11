import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { PROPOSAL_KINDS, PROPOSAL_STATES } from "./kinds.ts";
import { tags } from "./schema.ts";

export const proposals = sqliteTable(
  "proposals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind", { enum: PROPOSAL_KINDS }).notNull(),
    fromTagId: integer("from_tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    intoTagId: integer("into_tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    reason: text("reason"),
    state: text("state", { enum: PROPOSAL_STATES }).notNull(),
    createdAt: integer("created_at").notNull(),
    cursor: integer("cursor"),
    moved: integer("moved"),
    unitRevision: integer("unit_revision"),
  },
  (table) => [
    uniqueIndex("proposals_pair").on(
      sql`min(${table.fromTagId}, ${table.intoTagId})`,
      sql`max(${table.fromTagId}, ${table.intoTagId})`,
    ),
    index("proposals_from").on(table.fromTagId),
    index("proposals_into").on(table.intoTagId),
    index("proposals_state").on(table.state, table.id),
    check("proposals_distinct", sql`${table.fromTagId} <> ${table.intoTagId}`),
    check(
      "proposals_open_reason",
      sql`${table.state} <> 'open' or length(coalesce(${table.reason}, '')) > 0`,
    ),
  ],
);
