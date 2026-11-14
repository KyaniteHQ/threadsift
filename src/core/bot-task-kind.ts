import { and, type SQLWrapper } from "drizzle-orm";

import {
  type AnsweringParts,
  type BotAnswer,
  type BotAnswering,
  type BotResult,
  answerOf,
  botAnswering,
} from "./bot-task-answering.ts";
import { answerApplier } from "./bot-task-apply.ts";
import type { BotTaskStart } from "./bot-task-start.ts";
import type { BotTaskRow } from "./bot-task-states.ts";
import { guardHolds } from "./guards.ts";
import type { ClaimedJob, JobOutcome, JobPorts, JobWrites } from "./job-outcome.ts";
import { parsedJson } from "./parsed-json.ts";
import { grokBotChosen } from "./provider-saved.ts";

type BotPreparation =
  | {
      readonly kind: "ask";
      readonly start: BotTaskStart;
      readonly started?: (taskId: number) => void;
    }
  | { readonly kind: "settled"; readonly outcome: JobOutcome };

export type BotParse =
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
  readonly release: (db: JobPorts["db"], job: Readonly<ClaimedJob>) => JobWrites;
  readonly current: (db: JobPorts["db"], context: string) => Promise<boolean>;
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
  release = () => [],
  prepare,
  apply,
  ...parts
}: Readonly<
  KindParts<Context, Result> & {
    current: (context: Context) => Readonly<SQLWrapper>;
    release?: BotTaskKind["release"];
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
    release,
    current: async (db, contextText) => {
      const parsed = parsedJson(parts.context, contextText);

      return parsed !== null && (await guardHolds(db, current(parsed)));
    },
    describe,
    parse,
    apply: answerApplier(parse),
  };
}
