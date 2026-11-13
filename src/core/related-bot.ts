import { z } from "zod";

import { botTaskKind } from "./bot-task-kind.ts";
import { type PickItem, versionsHold } from "./related-input.ts";
import { preparedRelated } from "./related-prepare.ts";
import { relatedPickTask } from "./related-task.ts";
import { pickedOutcome } from "./related-write.ts";

const VersionSchema = z
  .object({
    id: z.number().int().positive(),
    digest: z.number().int().positive(),
    storedTags: z.string().nullable(),
  })
  .readonly();

const ContextSchema = z
  .object({ source: VersionSchema, sent: z.array(VersionSchema).readonly() })
  .readonly();

function versionOf({ id, digest, storedTags }: Readonly<PickItem>) {
  return { id, digest, storedTags };
}

export const relatedBotKind = botTaskKind({
  context: ContextSchema,
  task: ({ sent }) => relatedPickTask(sent.map(({ id }) => id)),
  current: versionsHold,
  prepare: async ({ db }, job) => {
    const prepared = await preparedRelated(db, job.itemId);

    if (prepared.kind === "settled") return prepared;

    const { source, sent, input } = prepared;

    return {
      kind: "ask",
      start: {
        kind: "related_pick",
        inputs: input,
        inputRevision: source.digest,
        context: JSON.stringify({
          source: versionOf(source),
          sent: sent.map((item) => versionOf(item)),
        }),
      },
    };
  },
  apply: ({ db }, _job, { context, taskId, result }) =>
    Promise.resolve(pickedOutcome(db, { versions: context, taskId, result })),
});
