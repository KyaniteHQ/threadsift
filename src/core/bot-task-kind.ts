import { and, type SQLWrapper } from "drizzle-orm";
import { z } from "zod";

import { failedAiTask } from "./ai-task-rows.ts";
import type { BotTaskRow } from "./ai-task-state.ts";
import {
  type AnsweringParts,
  type BotAnswer,
  type BotAnswering,
  type BotResult,
  answerOf,
  botAnswering,
} from "./bot-task-answering.ts";
import type { BotTaskStart } from "./bot-task-start.ts";
import type { Database } from "./database.ts";
import { guardHolds } from "./guards.ts";
import type { ClaimedJob, JobOutcome, JobPorts } from "./job-outcome.ts";
import { holding } from "./job-rows.ts";
import { parsedJson } from "./parsed-json.ts";
import { grokBotChosen } from "./provider-saved.ts";

type BotPreparation =
  | {
      readonly kind: "ask";
      readonly start: BotTaskStart;
      readonly started?: (taskId: number) => void;
    }
  | { readonly kind: "settled"; readonly outcome: JobOutcome };

type BotParse =
  | (Extract<BotAnswer, { readonly kind: "valid" }> & {
      readonly apply: (
        ports: JobPorts,
        job: Readonly<ClaimedJob>,
        task: Readonly<Pick<BotTaskRow, "id">>,
      ) => Promise<JobOutcome>;
    })
  | Extract<BotAnswer, { readonly kind: "invalid" }>;

export type SentTask = Readonly<Pick<BotTaskRow, "id" | "kind" | "context">>;

export interface SentTaskKind {
  readonly prepare: (ports: JobPorts, job: Readonly<ClaimedJob>) => Promise<BotPreparation>;
  readonly current: (db: Database, context: string) => Promise<boolean>;
  readonly describe: BotAnswering["describe"];
  readonly apply: (
    ports: JobPorts,
    job: Readonly<ClaimedJob>,
    task: Readonly<BotTaskRow>,
  ) => Promise<JobOutcome>;
}

export interface BotTaskKind extends SentTaskKind, BotAnswering {
  readonly parse: (context: string, body: Readonly<BotResult>) => BotParse;
}

interface KindParts<Context, Result> extends AnsweringParts<Context, Result> {
  readonly apply: (
    ports: JobPorts,
    job: Readonly<ClaimedJob>,
    applied: Readonly<{ context: Context; taskId: number; result: Result }>,
  ) => Promise<JobOutcome>;
}

function reparsed(
  kind: Readonly<Pick<BotTaskKind, "parse">>,
  { context, result }: Readonly<Pick<BotTaskRow, "context" | "result">>,
): BotParse {
  return kind.parse(context ?? "", { result: parsedJson(z.json(), result ?? "") });
}

function answerApplier(parse: BotTaskKind["parse"]): SentTaskKind["apply"] {
  return async (ports, job, task) => {
    const parsed = reparsed({ parse }, task);

    if (parsed.kind === "valid") return parsed.apply(ports, job, task);

    await failedAiTask(ports.db, task.id, { reason: "no-json", status: null }, holding(job));

    throw new Error("The Grok Bot answer no longer fits its task");
  };
}

function whileChosen(prepare: BotTaskKind["prepare"]): BotTaskKind["prepare"] {
  return async (ports, job) => {
    const prepared = await prepare(ports, job);

    if (prepared.kind !== "ask") return prepared;

    const chosen = grokBotChosen();

    return {
      ...prepared,
      start: { ...prepared.start, holds: and(prepared.start.holds, chosen) ?? chosen },
    };
  };
}

export function botTaskKind<Context, Result>({
  current,
  prepare,
  apply,
  ...parts
}: Readonly<
  KindParts<Context, Result> & {
    current: (context: Context) => Readonly<SQLWrapper>;
    prepare: BotTaskKind["prepare"];
  }
>): BotTaskKind {
  const { describe } = botAnswering(parts);

  const parse: BotTaskKind["parse"] = (contextText, body) => {
    const answer = answerOf(parts, contextText, body);

    if (answer.kind === "invalid") return answer;

    return {
      kind: "valid",
      normalized: answer.normalized,
      apply: (ports, job, { id }) =>
        apply(ports, job, { context: answer.context, taskId: id, result: answer.result }),
    };
  };

  return {
    prepare: whileChosen(prepare),
    current: async (db, contextText) => {
      const parsed = parsedJson(parts.context, contextText);

      return parsed !== null && (await guardHolds(db, current(parsed)));
    },
    describe,
    parse,
    apply: answerApplier(parse),
  };
}
