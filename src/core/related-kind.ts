import { z } from "zod";

import { defineAiKind } from "./ai-kind.ts";
import { VersionSchema, versionOf, versionsHold } from "./related-input.ts";
import { preparedRelated } from "./related-prepare.ts";
import { RELATED_OUTPUT_TOKENS, RELATED_TASK_KIND, relatedPickTask } from "./related-task.ts";
import { pickedWrites } from "./related-write.ts";

const ContextSchema = z
  .object({ source: VersionSchema, sent: z.array(VersionSchema).readonly() })
  .readonly();

export const relatedKind = defineAiKind({
  kind: RELATED_TASK_KIND,
  context: ContextSchema,
  label: "Related pick",
  task: ({ sent }) => relatedPickTask(sent.map(({ id }) => id)),
  current: versionsHold,
  prepare: async ({ db }, job) => {
    const prepared = await preparedRelated(db, job.itemId);

    if (prepared.kind === "settled") return prepared;

    const { source, sent, input } = prepared;

    return {
      kind: "ask",
      context: { source: versionOf(source), sent: sent.map((item) => versionOf(item)) },
      input,
      inputRevision: source.digest,
      maxOutputTokens: RELATED_OUTPUT_TOKENS,
    };
  },
  publish: (db, { context, result }) => ({
    writes: pickedWrites(db, context.source.id, result.picks),
  }),
});
