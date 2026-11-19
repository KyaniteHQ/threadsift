import { sql } from "drizzle-orm";

import { defineAiKind } from "./ai-kind.ts";
import { inputsHold } from "./topic-coverage.ts";
import { ContextSchema, overviewAtBot } from "./topic-overview-context.ts";
import { topicOfItem } from "./topic-overview-input.ts";
import { preparedOverview } from "./topic-overview-prepare.ts";
import { overviewRefused } from "./topic-overview-run.ts";
import {
  OVERVIEW_OUTPUT_TOKENS,
  TOPIC_OVERVIEW_TASK,
  topicOverviewTask,
} from "./topic-overview-task.ts";
import { revisedStored } from "./topic-overview-write.ts";

export const topicOverviewKind = defineAiKind({
  kind: TOPIC_OVERVIEW_TASK,
  context: ContextSchema,
  label: "Overview",
  task: topicOverviewTask,
  current: ({ topicId, revision, included, removed, removedTotal }) =>
    inputsHold(topicId, { revision, included, removed, removedTotal }),
  holds: ({ topicId }) => sql`not ${overviewAtBot(topicId)}`,
  defer: async (db, job) => {
    const topicId = await topicOfItem(db, job.itemId);

    return topicId === null ? null : { busy: overviewAtBot(topicId), wait: "topic-busy" };
  },
  prepare: async (ports, job) => {
    const prepared = await preparedOverview(ports.db, job);

    if (prepared.kind === "settled") return prepared;

    const { read, prompt, topicId } = prepared;
    const revision = read.page?.revision ?? 0;

    return {
      kind: "ask",
      context: {
        topicId,
        revision,
        builtFrom: read.page?.builtFrom ?? [],
        included: prompt.included.map(({ id, digest }) => ({ id, digest })),
        removed: read.removed,
        removedTotal: read.removedTotal,
        citable: prompt.citable,
        mustChange: prompt.mustChange,
        current: prompt.current,
      },
      input: prompt.input,
      inputRevision: revision,
      maxOutputTokens: OVERVIEW_OUTPUT_TOKENS,
    };
  },
  refused: (db, { topicId }, reason) => ({ writes: [overviewRefused(db, topicId, reason)] }),
  publish: (db, { context, result }) => revisedStored(db, { context, result }),
});
