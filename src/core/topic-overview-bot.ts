import { sql } from "drizzle-orm";

import { botTaskKind } from "./bot-task-kind.ts";
import { inputsHold } from "./topic-coverage.ts";
import {
  ContextSchema,
  TOPIC_OVERVIEW_TASK,
  overviewAtBot,
  overviewAtBotHolds,
} from "./topic-overview-context.ts";
import { preparedOverview } from "./topic-overview-prepare.ts";
import { topicOverviewTask } from "./topic-overview-task.ts";
import { currentInputs, revisedOutcome } from "./topic-overview-write.ts";

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
        kind: TOPIC_OVERVIEW_TASK,
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
});
