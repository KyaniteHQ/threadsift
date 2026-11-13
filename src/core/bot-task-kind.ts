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
  | { readonly kind: "ask"; readonly start: BotTaskStart }
  | { readonly kind: "settled"; readonly outcome: JobOutcome };

export type BotParse =
  | {
      readonly kind: "valid";
      readonly normalized: string;
      readonly apply: (
        ports: JobPorts,
        job: Readonly<ClaimedJob>,
        task: Readonly<Pick<BotTaskRow, "id">>,
      ) => Promise<JobOutcome>;
    }
  | { readonly kind: "invalid"; readonly reasons: string };

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

export interface BotTaskKind extends SentTaskKind {
  readonly parse: (context: string, body: Readonly<BotResult>) => BotParse;
}

interface KindParts<Context, Result> {
  readonly context: z.ZodType<Context>;
  readonly task: (context: Context) => AiTaskDefinition<Result>;
  readonly apply: (
    ports: JobPorts,
    job: Readonly<ClaimedJob>,
    applied: Readonly<{ context: Context; taskId: number; result: Result }>,
  ) => Promise<JobOutcome>;
}

function parsedAnswer<Context, Result>(
  { context, task, apply }: Readonly<KindParts<Context, Result>>,
  contextText: string,
  { result }: Readonly<BotResult>,
): BotParse {
  const parsedContext = parsedJson(context, contextText);

  if (parsedContext === null) return { kind: "invalid", reasons: "context: unreadable" };

  const parsed = task(parsedContext).schema.safeParse(result);

  if (!parsed.success) return { kind: "invalid", reasons: reasonsOf(parsed.error) };

  return {
    kind: "valid",
    normalized: JSON.stringify(parsed.data),
    apply: (ports, job, { id }) =>
      apply(ports, job, { context: parsedContext, taskId: id, result: parsed.data }),
  };
}

function describing<Context, Result>({
  context,
  task,
}: Readonly<Pick<KindParts<Context, Result>, "context" | "task">>): BotTaskKind["describe"] {
  return (contextText) => {
    const parsed = parsedJson(context, contextText);

    if (parsed === null) return null;

    const { instructions, schema } = task(parsed);

    return { instructions, schema: z.toJSONSchema(schema, { io: "output" }) };
  };
}

export function botTaskKind<Context, Result>({
  current,
  release = () => [],
  prepare,
  ...parts
}: Readonly<
  KindParts<Context, Result> & {
    current: (context: Context) => Readonly<SQLWrapper>;
    release?: BotTaskKind["release"];
    prepare: BotTaskKind["prepare"];
  }
>): BotTaskKind {
  const describe = describing(parts);
  const parse: BotTaskKind["parse"] = (contextText, body) => parsedAnswer(parts, contextText, body);

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
