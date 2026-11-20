import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { statusIdOf } from "../../../core/contract/links.ts";
import {
  IntakeAnswerSchema,
  IntakeContextSchema,
  X_INTAKE_INSTRUCTIONS,
  X_INTAKE_TASK,
  intakeInputText,
} from "../../../core/contract/x-intake-contract.ts";
import { settled } from "../../../core/kernel/job-outcome.ts";
import { items } from "../../../core/kernel/schema.ts";
import { defineBotOnlyKind } from "../../ai/core/ai-kind.ts";

export const xIntakeKind = defineBotOnlyKind({
  kind: X_INTAKE_TASK,
  context: IntakeContextSchema,
  current: ({ itemId, generation }) =>
    sql`exists (select 1 from ${items} where ${items.id} = ${itemId} and ${items.generation} = ${generation})`,
  describe: () => ({
    instructions: X_INTAKE_INSTRUCTIONS,
    schema: z.toJSONSchema(IntakeAnswerSchema, { io: "input" }),
  }),
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
      context: { itemId: job.itemId, generation, statusId, url },
      input: intakeInputText({ url, statusId }),
      inputRevision: generation,
    };
  },
});
