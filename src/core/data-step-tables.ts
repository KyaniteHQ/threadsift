import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const dataSteps = sqliteTable("data_steps", {
  name: text("name").primaryKey(),
  version: integer("version").notNull(),
});
