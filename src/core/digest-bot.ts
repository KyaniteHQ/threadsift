import { z } from "zod";

import { TASKS } from "./ai-tasks.ts";
import { botTaskKind } from "./bot-task-kind.ts";
import { GROK_BOT_EXECUTOR } from "./bot-task-states.ts";
import { preparedDigest } from "./digest-prepare.ts";
import { publishing } from "./digest-publish.ts";
import { digestInput, generationCurrent, keptNotUpdated, logSubmission } from "./digest-source.ts";
import { settled } from "./job-outcome.ts";

const ContextSchema = z
  .object({
    itemId: z.number().int().positive(),
    generation: z.number().int().min(0),
    version: z.number().int().min(0),
    submitted: z.array(z.string()).readonly(),
    staleRequeues: z.number().int().min(0),
  })
  .readonly();

export const digestBotKind = botTaskKind({
  context: ContextSchema,
  task: () => TASKS.digest,
  current: ({ itemId, generation }) =>
    generationCurrent({ id: itemId, generation, pendingDigest: null }),
  prepare: async (ports, job) => {
    const [item] = await digestInput(ports.db, job.itemId);

    if (item === undefined) {
      return settled({ writes: keptNotUpdated(ports.db, job.itemId) });
    }

    if (item.pendingDigest !== null) {
      throw new Error("A Digest the caller supplied is published without the Grok Bot");
    }

    const prepared = await preparedDigest(ports, job, item);

    if (prepared.kind === "settled") return prepared;

    const { catalog, prompt } = prepared;

    return {
      kind: "ask",
      start: {
        kind: "digest",
        inputs: prompt.input,
        inputRevision: item.generation,
        context: JSON.stringify({
          itemId: item.id,
          generation: item.generation,
          version: catalog.version,
          submitted: prompt.submitted,
          staleRequeues: job.staleRequeues,
        }),
      },
      started: (taskId) => {
        logSubmission(taskId, item, prompt.counts);
      },
    };
  },
  apply: ({ db }, _job, { context, taskId, result }) =>
    publishing(
      db,
      { id: context.itemId, generation: context.generation, pendingDigest: null },
      result,
      taskId,
      {
        executor: "model",
        provider: GROK_BOT_EXECUTOR,
        model: null,
        version: context.version,
        staleRequeues: context.staleRequeues,
        submitted: context.submitted,
      },
    ),
});
