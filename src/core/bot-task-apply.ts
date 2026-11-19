import { z } from "zod";

import { publishedOutcome } from "./ai-kind-publish.ts";
import type { AiKindDeclaration, ResultFace } from "./ai-kind-types.ts";
import { failedAiTask } from "./ai-task-rows.ts";
import { GROK_BOT_EXECUTOR } from "./ai-task-state.ts";
import { answerOf } from "./bot-task-answering.ts";
import { holding } from "./job-rows.ts";
import { parsedJson } from "./parsed-json.ts";

export function appliedFor<Context, Result, Basis>(
  declaration: Readonly<AiKindDeclaration<Context, Result, Basis>>,
): ResultFace["apply"] {
  return async ({ db }, job, task) => {
    const answer = answerOf(declaration, task.context ?? "", {
      result: parsedJson(z.json(), task.result ?? ""),
    });

    if (answer.kind === "invalid") {
      await failedAiTask(db, task.id, { reason: "no-json", status: null }, holding(job));

      throw new Error("The Grok Bot answer no longer fits its task");
    }

    return publishedOutcome(db, declaration, {
      context: answer.context,
      result: answer.result,
      taskId: task.id,
      by: { provider: GROK_BOT_EXECUTOR, model: null },
      basis: null,
    });
  };
}
