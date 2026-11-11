import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { topics } from "./schema.ts";
import { type BuiltFrom, OVERVIEW_FAILURES } from "./topic-overview-contract.ts";

export const topicPages = sqliteTable("topic_pages", {
  topicId: integer("topic_id")
    .primaryKey()
    .references(() => topics.id),
  overview: text("overview"),
  revision: integer("revision").notNull(),
  builtFrom: text("built_from", { mode: "json" }).$type<BuiltFrom>().notNull(),
  failure: text("failure", { enum: OVERVIEW_FAILURES }),
  updatedAt: integer("updated_at").notNull(),
});

export const topicLeases = sqliteTable("topic_leases", {
  topicId: integer("topic_id")
    .primaryKey()
    .references(() => topics.id),
  holder: text("holder").notNull(),
  expiresAt: integer("expires_at").notNull(),
  generation: integer("generation").notNull(),
});
