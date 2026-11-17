import { sql } from "drizzle-orm";
import { z } from "zod";

import { botTaskKind } from "./bot-task-kind.ts";
import { overviewAtBot, overviewAtBotHolds } from "./bot-task-states.ts";
import { inputsHold } from "./topic-coverage.ts";
import { BuiltFromSchema } from "./topic-overview-contract.ts";
import { preparedOverview } from "./topic-overview-prepare.ts";
import { topicOverviewTask } from "./topic-overview-task.ts";
import { currentInputs, revisedOutcome } from "./topic-overview-write.ts";

const IdSchema = z.number().int().positive();

const ContextSchema = z
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

export const topicOverviewBotKind = botTaskKind({
  context: ContextSchema,
  task: topicOverviewTask,
  current: ({ topicId, revision, included, removed, removedTotal }) =>
    inputsHold(topicId, { revision, included, removed, removedTotal }),
  prepare: async (ports, job) => {
    const prepared = await preparedOverview(ports.db, job, overviewAtBot);

    if (prepared.kind === "settled") return prepared;

    const { read, prompt, topicId } = prepared;
    const revision = read.page?.revision ?? 0;

    return {
      kind: "ask",
      start: {
        kind: "topic_overview",
        inputs: prompt.input,
        inputRevision: revision,
        context: JSON.stringify({
          topicId,
          revision,
          builtFrom: read.page?.builtFrom ?? [],
          included: prompt.included.map(({ id, digest }) => ({ id, digest })),
          removed: read.removed,
          removedTotal: read.removedTotal,
          citable: prompt.citable,
          mustChange: prompt.mustChange,
          current: prompt.current,
        }),
        holds: sql`${overviewAtBotHolds(topicId)} and ${currentInputs(topicId, read, prompt.included)}`,
      },
    };
  },
  apply: ({ db }, _job, { context, taskId, result }) =>
    Promise.resolve(
      revisedOutcome(db, context.topicId, {
        read: {
          page: { revision: context.revision, builtFrom: context.builtFrom },
          removed: context.removed,
          removedTotal: context.removedTotal,
        },
        prompt: { current: context.current, included: context.included },
        taskId,
        result,
      }),
    ),
});
