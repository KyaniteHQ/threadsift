import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { PIN_KINDS } from "./kinds.ts";
import { items, tags, topics } from "./schema.ts";

export const pins = sqliteTable(
  "pins",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind", { enum: PIN_KINDS }).notNull(),
    fromKey: text("from_key").notNull(),
    fromName: text("from_name").notNull(),
    intoTagId: integer("into_tag_id").references(() => tags.id),
    intoTopicId: integer("into_topic_id").references(() => topics.id),
    fromItemId: integer("from_item_id").references(() => items.id, { onDelete: "cascade" }),
    intoItemId: integer("into_item_id").references(() => items.id, { onDelete: "cascade" }),
    fromDigest: integer("from_digest"),
    intoDigest: integer("into_digest"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("pins_kind_key").on(table.kind, table.fromKey),
    index("pins_into").on(table.intoTagId),
    index("pins_into_topic").on(table.intoTopicId),
    index("pins_from_item").on(table.fromItemId),
    index("pins_into_item").on(table.intoItemId),
  ],
);
