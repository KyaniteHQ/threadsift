import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";

import { GROK_BOT_EXECUTOR, RUNNING, answeredOrBefore } from "./ai-task-state.ts";
import { aiTasks } from "./schema.ts";
import { BuiltFromSchema } from "./topic-overview-contract.ts";
import { TOPIC_OVERVIEW_TASK } from "./topic-overview-task.ts";

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

export type OverviewContext = z.output<typeof ContextSchema>;

export function overviewContextField(key: keyof OverviewContext): SQL {
  return sql`json_extract(${aiTasks.context}, ${sql.raw(`'$.${key}'`)})`;
}

export function overviewAtBot(topicId: number): SQL {
  return sql`exists (select 1 from ${aiTasks} where ${aiTasks.executor} = ${GROK_BOT_EXECUTOR} and ${aiTasks.kind} = ${TOPIC_OVERVIEW_TASK} and ${RUNNING} and ${overviewContextField("topicId")} = ${topicId} and ${answeredOrBefore(Date.now())})`;
}
