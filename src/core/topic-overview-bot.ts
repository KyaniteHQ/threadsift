import { z } from "zod";

import { botTaskKind } from "./bot-task-kind.ts";
import { inputsHold } from "./topic-coverage.ts";
import { recoverPrefixLeases } from "./topic-lease.ts";
import { BuiltFromSchema } from "./topic-overview-contract.ts";
import { leasedForApply, preparedOverview } from "./topic-overview-prepare.ts";
import { overviewHolderPrefix } from "./topic-overview-run.ts";
import { topicOverviewTask } from "./topic-overview-task.ts";
import { revisedOutcome } from "./topic-overview-write.ts";

const IdSchema = z.number().int().positive();

const ContextSchema = z
  .object({
    topicId: IdSchema,
    revision: z.number().int().min(0),
    builtFrom: BuiltFromSchema,
    included: z.array(z.object({ id: IdSchema, digest: IdSchema }).readonly()).readonly(),
    removed: z.array(IdSchema).readonly(),
    citable: z.array(IdSchema).readonly(),
    mustChange: z.boolean(),
    current: z.string().nullable(),
  })
  .readonly();

export const topicOverviewBotKind = botTaskKind({
  context: ContextSchema,
  task: topicOverviewTask,
  current: ({ topicId, revision, included, removed }) =>
    inputsHold(topicId, { revision, included, removed }),
  release: (db, job) => [recoverPrefixLeases(db, overviewHolderPrefix(job.id))],
  prepare: async (ports, job) => {
    const prepared = await preparedOverview(ports.db, job);

    if (prepared.kind === "settled") return prepared;

    const { read, prompt, lease } = prepared;
    const revision = read.page?.revision ?? 0;

    return {
      kind: "ask",
      start: {
        kind: "topic_overview",
        inputs: prompt.input,
        inputRevision: revision,
        context: JSON.stringify({
          topicId: lease.topicId,
          revision,
          builtFrom: read.page?.builtFrom ?? [],
          included: prompt.included.map(({ id, digest }) => ({ id, digest })),
          removed: read.removed,
          citable: prompt.citable,
          mustChange: prompt.mustChange,
          current: prompt.current,
        }),
      },
    };
  },
  apply: async ({ db }, job, { context, taskId, result }) => {
    const leased = await leasedForApply(db, job, { topicId: context.topicId, taskId });

    if (leased.kind === "settled") return leased.outcome;

    return revisedOutcome(db, leased.lease, {
      read: {
        page: { revision: context.revision, builtFrom: context.builtFrom },
        removed: context.removed,
      },
      prompt: { current: context.current, included: context.included },
      taskId,
      result,
    });
  },
});
