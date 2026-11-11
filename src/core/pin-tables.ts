import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { PIN_KINDS } from "./kinds.ts";
import { tags } from "./schema.ts";

export const pins = sqliteTable(
  "pins",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind", { enum: PIN_KINDS }).notNull(),
    fromKey: text("from_key").notNull(),
    fromName: text("from_name").notNull(),
    intoTagId: integer("into_tag_id")
      .notNull()
      .references(() => tags.id),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("pins_kind_key").on(table.kind, table.fromKey),
    index("pins_into").on(table.intoTagId),
  ],
);
