import { z } from "zod";

import type { BotParse, BotTaskKind } from "./bot-task-kind.ts";
import { parsedJson } from "./parsed-json.ts";
import type { PickItem, Versions } from "./related-input.ts";
import { preparedRelated } from "./related-prepare.ts";
import { relatedPickTask } from "./related-task.ts";
import { pickedOutcome } from "./related-write.ts";
import { reasonsOf } from "./zod-reasons.ts";

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

function taskOf({ sent }: Readonly<Versions>) {
  return relatedPickTask(sent.map(({ id }) => id));
}

function parse(contextText: string, resultText: string): BotParse {
  const context = parsedJson(ContextSchema, contextText);

  if (context === null) return { kind: "invalid", reasons: "context: unreadable" };

  const parsed = taskOf(context).schema.safeParse(parsedJson(z.json(), resultText));

  if (!parsed.success) return { kind: "invalid", reasons: reasonsOf(parsed.error) };

  const { data: result } = parsed;

  return {
    kind: "valid",
    apply: (db, task) => pickedOutcome(db, { versions: context, taskId: task.id, result }),
  };
}

export const relatedBotKind: BotTaskKind = {
  prepare: async (db, job) => {
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
  describe: (contextText) => {
    const context = parsedJson(ContextSchema, contextText);

    if (context === null) return null;

    const task = taskOf(context);

    return {
      instructions: task.instructions,
      schema: z.toJSONSchema(task.schema, { io: "output" }),
    };
  },
  parse,
};
