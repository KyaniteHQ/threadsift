import type { SQLWrapper } from "drizzle-orm";

import { deletedUndigestedTasks } from "../../../core/kernel/ai-task-rows.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { endedExport } from "../../export/core/export-job.ts";

export function clearedAtStart(db: Database, starting: Readonly<SQLWrapper>) {
  return [deletedUndigestedTasks(db, starting), endedExport(db, starting, "cancelled")] as const;
}
