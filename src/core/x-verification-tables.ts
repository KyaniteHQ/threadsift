import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { items } from "./item-tables.ts";
import type { Judged } from "./x-verdict.ts";

export const xVerifications = sqliteTable("x_verifications", {
  itemId: integer("item_id")
    .primaryKey()
    .references(() => items.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull(),
  thread: text("thread").notNull(),
  cliAttempts: integer("cli_attempts"),
  digest: text("digest"),
  judged: text("judged", { mode: "json" }).$type<Judged>().notNull(),
});
