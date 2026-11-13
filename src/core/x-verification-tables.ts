import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { items } from "./schema.ts";
import type { Judged } from "./x-verify-state.ts";

export const xVerifications = sqliteTable("x_verifications", {
  itemId: integer("item_id")
    .primaryKey()
    .references(() => items.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull(),
  thread: text("thread").notNull(),
  digest: text("digest"),
  judged: text("judged", { mode: "json" }).$type<Judged>().notNull(),
});
