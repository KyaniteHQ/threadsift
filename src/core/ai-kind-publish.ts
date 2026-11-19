import { sql } from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";

import type { AiKindDeclaration, Answered, Stored } from "./ai-kind-types.ts";
import { completedAiTask } from "./ai-task-rows.ts";
import { aiTaskRunning } from "./ai-task-state.ts";
import type { Database } from "./database.ts";
import { guardedOutcome } from "./guarded-outcome.ts";
import type { JobOutcome } from "./job-outcome.ts";

export function storedOutcome<Result>(
  db: Database,
  {
    current,
    taskId,
    answer,
  }: Readonly<{ current: Readonly<SQLWrapper>; taskId: number; answer: unknown }>,
  stored: Readonly<Stored<Result>>,
): JobOutcome | Promise<JobOutcome> {
  const running = sql`${current} and ${aiTaskRunning(taskId)}`;
  const guard = stored.also === undefined ? running : sql`${running} and ${stored.also}`;

  const guarded = guardedOutcome(db, guard, {
    taskId,
    writes: [...stored.writes, completedAiTask(db, { taskId, result: stored.result ?? answer })],
  });

  const outcome =
    stored.continuation === undefined ? guarded : { ...guarded, continuation: stored.continuation };

  return stored.settle === undefined ? outcome : stored.settle(outcome);
}

export async function publishedOutcome<Context, Result, Basis>(
  db: Database,
  declaration: Readonly<Pick<AiKindDeclaration<Context, Result, Basis>, "current" | "publish">>,
  answered: Readonly<Answered<Context, Result, Basis>>,
): Promise<JobOutcome> {
  const stored = await declaration.publish(db, answered);

  return storedOutcome(
    db,
    {
      current: declaration.current(answered.context),
      taskId: answered.taskId,
      answer: answered.result,
    },
    stored,
  );
}
