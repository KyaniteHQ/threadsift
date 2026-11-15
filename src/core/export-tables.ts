import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { EXPORT_FAILURES } from "./export-contract.ts";
import { EXPORT_STATES } from "./kinds.ts";

export const exportRuns = sqliteTable(
  "exports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    state: text("state", { enum: EXPORT_STATES }).notNull(),
    createdAt: integer("created_at").notNull(),
    finishedAt: integer("finished_at"),
    stream: text("stream").notNull().default(""),
    cursor: integer("cursor").notNull().default(0),
    entries: integer("entries").notNull().default(0),
    dataBytes: integer("data_bytes").notNull().default(0),
    dirBytes: integer("dir_bytes").notNull().default(0),
    tailBytes: integer("tail_bytes").notNull().default(0),
    parts: integer("parts").notNull().default(0),
    tally: text("tally").notNull().default("{}"),
    failure: text("failure", { enum: EXPORT_FAILURES }),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("exports_one_live")
      .on(sql`1`)
      .where(sql`${table.state} in ('running', 'ready')`),
  ],
);

export type ExportRow = typeof exportRuns.$inferSelect;
