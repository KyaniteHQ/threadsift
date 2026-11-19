import { z } from "zod";

import { defineBasedAiKind } from "./ai-kind.ts";
import { preparedDigest } from "./digest-prepare.ts";
import { digestStored } from "./digest-publish.ts";
import {
  digestInput,
  generationCurrent,
  keptNotUpdated,
  logSubmission,
  markDigest,
} from "./digest-source.ts";
import { DIGEST_TASK } from "./digest-task.ts";
import { settled } from "./job-outcome.ts";

const ContextSchema = z
  .object({
    itemId: z.number().int().positive(),
    generation: z.number().int().min(0),
    submitted: z.array(z.string()).readonly(),
  })
  .readonly();

export const digestKind = defineBasedAiKind({
  kind: DIGEST_TASK.kind,
  context: ContextSchema,
  label: "Digest",
  task: () => DIGEST_TASK,
  current: ({ itemId, generation }) =>
    generationCurrent({ id: itemId, generation, pendingDigest: null }),
  prepare: async (ports, job) => {
    const [item] = await digestInput(ports.db, job.itemId);

    if (item === undefined) return settled({ writes: keptNotUpdated(ports.db, job.itemId) });

    const prepared = await preparedDigest(ports, job, item);

    if (prepared.kind === "settled") return prepared;

    const { catalog, prompt } = prepared;

    return {
      kind: "ask",
      context: { itemId: item.id, generation: item.generation, submitted: prompt.submitted },
      input: prompt.input,
      inputRevision: item.generation,
      maxOutputTokens: prompt.maxOutputTokens,
      basis: { version: catalog.version, staleRequeues: job.staleRequeues },
      started: (taskId) => {
        logSubmission(taskId, item, prompt.counts);
      },
    };
  },
  refused: (db, { itemId }) => ({ writes: [markDigest(db, itemId, "attempt-failed")] }),
  publish: (db, answered) =>
    digestStored(
      db,
      {
        id: answered.context.itemId,
        generation: answered.context.generation,
        pendingDigest: null,
      },
      answered.result,
      {
        taskId: answered.taskId,
        source: {
          executor: "model",
          provider: answered.by.provider,
          model: answered.by.model,
          catalog:
            answered.executor === "model"
              ? { kind: "checked", ...answered.basis }
              : { kind: "unchecked" },
          submitted: answered.context.submitted,
        },
      },
    ),
});
