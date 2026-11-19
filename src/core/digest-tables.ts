import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { aiTasks } from "./ai-task-tables.ts";
import { items } from "./item-tables.ts";

export const digests = sqliteTable("digests", {
  itemId: integer("item_id")
    .primaryKey()
    .references(() => items.id, { onDelete: "cascade" }),
  digest: text("digest").notNull(),
  title: text("title").notNull(),
  topic: text("topic").notNull(),
  taskId: integer("task_id")
    .notNull()
    .references(() => aiTasks.id),
  provider: text("provider"),
  model: text("model"),
  generation: integer("generation").notNull(),
  createdAt: integer("created_at").notNull(),
});
