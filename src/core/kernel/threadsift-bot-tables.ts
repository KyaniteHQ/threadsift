import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const AUTO_INSTALL_DEFAULT = true;

export const threadsiftBot = sqliteTable(
  "threadsift_bot",
  {
    id: integer("id").primaryKey(),
    autoInstall: integer("auto_install", { mode: "boolean" })
      .notNull()
      .default(AUTO_INSTALL_DEFAULT),
    version: text("version"),
    skillVersion: text("skill_version"),
    refused: text("refused"),
    reportedAt: integer("reported_at"),
    reportedBy: integer("reported_by"),
  },
  (table) => [
    check("threadsift_bot_is_one_row", sql`${table.id} = 1`),
    check(
      "threadsift_bot_reported",
      sql`(${table.version} is null) = (${table.skillVersion} is null) and (${table.version} is null) = (${table.reportedAt} is null) and (${table.version} is null) = (${table.reportedBy} is null) and (${table.version} is not null or ${table.refused} is null)`,
    ),
  ],
);
