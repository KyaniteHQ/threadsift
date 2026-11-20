import { z } from "zod";

import { GROK_BOT_PROVIDER } from "../../../core/contract/provider-families.ts";
import { failedAiTask } from "../../../core/kernel/ai-task-rows.ts";
import { GROK_BOT_EXECUTOR } from "../../../core/kernel/ai-task-state.ts";
import { holding } from "../../../core/kernel/job-rows.ts";
import { parsedJson } from "../../../core/kernel/parsed-json.ts";
import { publishedOutcome } from "./ai-kind-publish.ts";
import type { AiKindDeclaration, ResultFace } from "./ai-kind-types.ts";
import { answerOf } from "./bot-task-answering.ts";

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
      by: { provider: GROK_BOT_PROVIDER, model: null },
      executor: GROK_BOT_EXECUTOR,
    });
  };
}
