import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { PIN_KINDS } from "./kinds.ts";
import { tags, topics } from "./schema.ts";

export const pins = sqliteTable(
  "pins",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind", { enum: PIN_KINDS }).notNull(),
    fromKey: text("from_key").notNull(),
    fromName: text("from_name").notNull(),
    intoTagId: integer("into_tag_id").references(() => tags.id),
    intoTopicId: integer("into_topic_id").references(() => topics.id),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("pins_kind_key").on(table.kind, table.fromKey),
    index("pins_into").on(table.intoTagId),
    index("pins_into_topic").on(table.intoTopicId),
  ],
);
