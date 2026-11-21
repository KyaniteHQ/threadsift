import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { RESTORE_FAILURES, RESTORE_PHASES, RESTORE_STATES } from "../contract/restore-contract.ts";
import { OPEN_RUNS, standingSql } from "./restore-standing.ts";
import { listed } from "./schema-checks.ts";

export const restoreRuns = sqliteTable(
  "restores",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    state: text("state", { enum: RESTORE_STATES }).notNull(),
    phase: text("phase", { enum: RESTORE_PHASES }).notNull().default("upload"),
    cursor: text("cursor").notNull().default("{}"),
    restored: text("restored").notNull().default("{}"),
    dropped: text("dropped").notNull().default("{}"),
    bytes: integer("bytes").notNull(),
    parts: integer("parts").notNull(),
    partBytes: integer("part_bytes").notNull(),
    failure: text("failure", { enum: RESTORE_FAILURES }),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    finishedAt: integer("finished_at"),
  },
  (table) => [
    check("restores_values_check", sql`${table.state} in (${listed(RESTORE_STATES)})`),
    uniqueIndex("restores_one_open")
      .on(sql`1`)
      .where(standingSql(table, OPEN_RUNS)),
  ],
);

export type RestoreRow = typeof restoreRuns.$inferSelect;
