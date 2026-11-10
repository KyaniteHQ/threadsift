import { and, asc, eq, gt, isNull, lte, ne, notExists, sql } from "drizzle-orm";

import { VERIFY_INPUT } from "./ai-contract.ts";
import type { Advance, DataStep } from "./data-step-contract.ts";
import { cutDigestInput } from "./digest-prompt.ts";
import type { Database } from "./ports.ts";
import { aiTasks, digests } from "./schema.ts";

const UNIT_ROWS = 500;

async function advanceAiTaskOwners(db: Database, cursor: string | null): Promise<Advance> {
  const from = cursor === null ? 0 : Number(cursor);

  const page = await db
    .select({ id: aiTasks.id })
    .from(aiTasks)
    .where(gt(aiTasks.id, from))
    .orderBy(asc(aiTasks.id))
    .limit(UNIT_ROWS);

  const last = page.at(-1);

  if (last === undefined) return { writes: [], cursor: null };

  return {
    writes: [
      db.delete(aiTasks).where(
        and(
          gt(aiTasks.id, from),
          lte(aiTasks.id, last.id),
          isNull(aiTasks.itemId),
          ne(aiTasks.inputs, cutDigestInput(VERIFY_INPUT)),
          notExists(
            db
              .select({ one: sql`1` })
              .from(digests)
              .where(eq(digests.taskId, aiTasks.id)),
          ),
        ),
      ),
    ],
    cursor: String(last.id),
  };
}

export const aiTaskOwnersStep: DataStep = {
  name: "ai-task-owners",
  version: 1,
  advance: advanceAiTaskOwners,
};
