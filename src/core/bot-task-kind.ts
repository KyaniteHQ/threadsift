import type { SQLWrapper } from "drizzle-orm";
import { z } from "zod";

import type { AiTaskDefinition } from "./ai-contract.ts";
import { answerApplier } from "./bot-task-apply.ts";
import type { BotTaskStart } from "./bot-task-start.ts";
import type { BotTaskRow } from "./bot-task-states.ts";
import { guardHolds } from "./guards.ts";
import type { ClaimedJob, JobOutcome, JobPorts, JobWrites } from "./job-outcome.ts";
import { parsedJson } from "./parsed-json.ts";
import { reasonsOf } from "./zod-reasons.ts";

export interface BotResult {
  readonly result: unknown;
}

export interface BotInstructions {
  readonly instructions: string;
  readonly schema: z.core.JSONSchema.BaseSchema;
}

export type BotPreparation =
  | {
      readonly kind: "ask";
      readonly start: BotTaskStart;
      readonly started?: (taskId: number) => void;
    }
  | { readonly kind: "settled"; readonly outcome: JobOutcome };

export type BotAnswer =
  | { readonly kind: "valid"; readonly normalized: string }
  | { readonly kind: "invalid"; readonly reasons: string };

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
  readonly describe: (context: string) => BotInstructions | null;
  readonly apply: (
    ports: JobPorts,
    job: Readonly<ClaimedJob>,
    task: Readonly<BotTaskRow>,
  ) => Promise<JobOutcome>;
}

export interface BotAnswering {
  readonly describe: SentTaskKind["describe"];
  readonly parse: (context: string, body: Readonly<BotResult>) => BotAnswer;
}

export interface BotTaskKind extends SentTaskKind, BotAnswering {
  readonly parse: (context: string, body: Readonly<BotResult>) => BotParse;
}

interface AnsweringParts<Context, Result> {
  readonly context: z.ZodType<Context>;
  readonly task: (context: Context) => AiTaskDefinition<Result>;
}

interface KindParts<Context, Result> extends AnsweringParts<Context, Result> {
  readonly apply: (
    ports: JobPorts,
    job: Readonly<ClaimedJob>,
    applied: Readonly<{ context: Context; taskId: number; result: Result }>,
  ) => Promise<JobOutcome>;
}

function answerOf<Context, Result>(
  { context, task }: Readonly<AnsweringParts<Context, Result>>,
  contextText: string,
  { result }: Readonly<BotResult>,
):
  | {
      readonly kind: "valid";
      readonly normalized: string;
      readonly context: Context;
      readonly result: Result;
    }
  | Extract<BotAnswer, { readonly kind: "invalid" }> {
  const parsedContext = parsedJson(context, contextText);

  if (parsedContext === null) return { kind: "invalid", reasons: "context: unreadable" };

  const parsed = task(parsedContext).schema.safeParse(result);

  if (!parsed.success) return { kind: "invalid", reasons: reasonsOf(parsed.error) };

  return {
    kind: "valid",
    normalized: JSON.stringify(parsed.data),
    context: parsedContext,
    result: parsed.data,
  };
}

export function botAnswering<Context, Result>(
  parts: Readonly<AnsweringParts<Context, Result>>,
): BotAnswering {
  const { context, task } = parts;

  return {
    describe: (contextText) => {
      const parsed = parsedJson(context, contextText);

      if (parsed === null) return null;

      const { instructions, schema } = task(parsed);

      return { instructions, schema: z.toJSONSchema(schema, { io: "output" }) };
    },
    parse: (contextText, body) => {
      const answer = answerOf(parts, contextText, body);

      return answer.kind === "valid" ? { kind: "valid", normalized: answer.normalized } : answer;
    },
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
    prepare,
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
