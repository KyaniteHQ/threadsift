import { type SQL, sql } from "drizzle-orm";
import type { z } from "zod";

import { aiTasks } from "./schema.ts";

export function contextField<Context, Key extends keyof Context & string>(
  schema: z.ZodType<Context>,
  key: Key,
): SQL<Context[Key]> {
  return sql<Context[Key]>`json_extract(${aiTasks.context}, ${sql.raw(`'$.${key}'`)})`;
}
