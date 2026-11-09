import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { MEDIA_FAILURES, MEDIA_KINDS, MEDIA_OUTCOMES } from "./kinds.ts";
import { items } from "./schema.ts";

export const media = sqliteTable(
  "media",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: MEDIA_KINDS }).notNull(),
    sourceUrl: text("source_url").notNull(),
    finalUrl: text("final_url"),
    position: integer("position").notNull(),
    alt: text("alt").notNull().default(""),
    width: integer("width"),
    height: integer("height"),
    outcome: text("outcome", { enum: MEDIA_OUTCOMES }).notNull(),
    reason: text("reason", { enum: MEDIA_FAILURES }),
    fileKey: text("file_key"),
    contentType: text("content_type"),
    size: integer("size"),
  },
  (table) => [
    uniqueIndex("media_item_source").on(table.itemId, table.kind, table.sourceUrl),
    uniqueIndex("media_file_key").on(table.fileKey),
    check("media_video_is_linked", sql`(${table.kind} = 'video') = (${table.outcome} = 'linked')`),
    check(
      "media_failed_has_reason",
      sql`(${table.outcome} = 'failed') = (${table.reason} is not null)`,
    ),
    check(
      "media_stored_has_file",
      sql`(${table.outcome} = 'stored') = (${table.fileKey} is not null and ${table.contentType} is not null and ${table.size} is not null)`,
    ),
  ],
);

export type MediaRow = typeof media.$inferSelect;
