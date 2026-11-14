import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { SentTaskKind } from "./bot-task-kind.ts";
import { lostOutcome } from "./guarded-outcome.ts";
import { guardHolds } from "./guards.ts";
import { settled } from "./job-outcome.ts";
import { statusIdOf } from "./links.ts";
import { parsedJson } from "./parsed-json.ts";
import { items } from "./schema.ts";
import {
  IntakeAnswerSchema,
  IntakeContextSchema,
  X_INTAKE_INSTRUCTIONS,
  X_INTAKE_TASK,
  intakeInputText,
} from "./x-intake-contract.ts";

export const xIntakeKind: SentTaskKind = {
  servesProvider: false,
  apply: ({ db }, _job, { id }) => Promise.resolve(lostOutcome(db, { taskId: id })),
  release: () => [],
  prepare: async ({ db }, job) => {
    const [item] = await db
      .select({ generation: items.generation, normalizedUrl: items.normalizedUrl })
      .from(items)
      .where(eq(items.id, job.itemId));

    const statusId = item === undefined ? null : statusIdOf(item.normalizedUrl);

    if (item === undefined || statusId === null) return settled({ writes: [] });

    const { normalizedUrl: url, generation } = item;

    return {
      kind: "ask",
      start: {
        kind: X_INTAKE_TASK,
        inputs: intakeInputText({ url, statusId }),
        inputRevision: generation,
        context: JSON.stringify({ itemId: job.itemId, generation, statusId, url }),
      },
    };
  },
  current: async (db, contextText) => {
    const context = parsedJson(IntakeContextSchema, contextText);

    return (
      context !== null &&
      (await guardHolds(
        db,
        sql`exists (select 1 from ${items} where ${items.id} = ${context.itemId} and ${items.generation} = ${context.generation})`,
      ))
    );
  },
  describe: (context) =>
    parsedJson(IntakeContextSchema, context) === null
      ? null
      : {
          instructions: X_INTAKE_INSTRUCTIONS,
          schema: z.toJSONSchema(IntakeAnswerSchema, { io: "input" }),
        },
};
