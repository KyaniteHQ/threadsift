import { z } from "zod";

import { failedAiTask } from "./ai-tasks.ts";
import type { BotParse, BotTaskKind, SentTaskKind } from "./bot-task-kind.ts";
import type { BotTaskRow } from "./bot-task-states.ts";
import { holding } from "./job-rows.ts";
import { parsedJson } from "./parsed-json.ts";

export function reparsed(
  kind: Readonly<Pick<BotTaskKind, "parse">>,
  { context, result }: Readonly<Pick<BotTaskRow, "context" | "result">>,
): BotParse {
  return kind.parse(context ?? "", { result: parsedJson(z.json(), result ?? "") });
}

export function answerApplier(parse: BotTaskKind["parse"]): SentTaskKind["apply"] {
  return async (ports, job, task) => {
    const parsed = reparsed({ parse }, task);

    if (parsed.kind === "valid") return parsed.apply(ports, job, task);

    await failedAiTask(ports.db, task.id, { reason: "no-json", status: null }, holding(job));

    throw new Error("The Grok Bot answer no longer fits its task");
  };
}
