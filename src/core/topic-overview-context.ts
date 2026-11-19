import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";

import { GROK_BOT_EXECUTOR, outstanding } from "./ai-task-state.ts";
import type { Database } from "./database.ts";
import { guardHolds } from "./guards.ts";
import { aiTasks } from "./schema.ts";
import { BuiltFromSchema } from "./topic-overview-contract.ts";

export const TOPIC_OVERVIEW_TASK = "topic_overview";

const IdSchema = z.number().int().positive();

export const ContextSchema = z
  .object({
    topicId: IdSchema,
    revision: z.number().int().min(0),
    builtFrom: BuiltFromSchema,
    included: z.array(z.object({ id: IdSchema, digest: IdSchema }).readonly()).readonly(),
    removed: z.array(IdSchema).readonly(),
    removedTotal: z.number().int().min(0),
    citable: z.array(IdSchema).readonly(),
    mustChange: z.boolean(),
    current: z.string().nullable(),
  })
  .readonly();

export function overviewAtBotHolds(topicId: number): SQL {
  return sql`not exists (select 1 from ${aiTasks} where ${aiTasks.executor} = ${GROK_BOT_EXECUTOR} and ${aiTasks.kind} = ${TOPIC_OVERVIEW_TASK} and ${outstanding(Date.now())} and json_extract(${aiTasks.context}, '$.topicId') = ${topicId})`;
}

export async function overviewAtBot(db: Database, topicId: number): Promise<boolean> {
  return !(await guardHolds(db, overviewAtBotHolds(topicId)));
}
