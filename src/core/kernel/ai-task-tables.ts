import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { items } from "./item-tables.ts";

export const aiTasks = sqliteTable(
  "ai_tasks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind").notNull(),
    inputs: text("inputs").notNull(),
    inputRevision: integer("input_revision").notNull(),
    executor: text("executor").notNull(),
    provider: text("provider"),
    model: text("model"),
    attempts: integer("attempts").notNull(),
    deadline: integer("deadline").notNull(),
    state: text("state", { enum: ["running", "done", "failed"] }).notNull(),
    result: text("result"),
    refusal: text("refusal"),
    status: integer("status"),
    itemId: integer("item_id").references(() => items.id, { onDelete: "cascade" }),
    callbackHash: text("callback_hash"),
    jobId: integer("job_id"),
    context: text("context"),
    sentAt: integer("sent_at"),
    answeredAt: integer("answered_at"),
    answerRefusals: integer("answer_refusals").notNull().default(0),
  },
  (table) => [
    index("ai_tasks_item").on(table.itemId),
    index("ai_tasks_job").on(table.jobId),
    index("ai_tasks_executor_state").on(table.executor, table.state),
  ],
);
