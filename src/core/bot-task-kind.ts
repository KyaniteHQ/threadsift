import type { SQLWrapper } from "drizzle-orm";
import { z } from "zod";

import type { AiTaskDefinition } from "./ai-contract.ts";
import type { BotTaskStart } from "./bot-task-start.ts";
import type { BotTaskRow } from "./bot-task-states.ts";
import { guardHolds } from "./guards.ts";
import type { ClaimedJob, JobOutcome, JobPorts, JobWrites } from "./job-outcome.ts";
import { parsedJson } from "./parsed-json.ts";
import type { Database } from "./ports.ts";
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

export interface BotTaskKind {
  readonly prepare: (ports: JobPorts, job: Readonly<ClaimedJob>) => Promise<BotPreparation>;
  readonly release: (db: Database, job: Readonly<ClaimedJob>) => JobWrites;
  readonly current: (db: Database, context: string) => Promise<boolean>;
  readonly describe: (context: string) => BotInstructions | null;
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
  const { context, task } = parts;

  return {
    prepare,
    release,
    current: async (db, contextText) => {
      const parsed = parsedJson(context, contextText);

      return parsed !== null && (await guardHolds(db, current(parsed)));
    },
    describe: (contextText) => {
      const parsed = parsedJson(context, contextText);

      if (parsed === null) return null;

      const { instructions, schema } = task(parsed);

      return { instructions, schema: z.toJSONSchema(schema, { io: "output" }) };
    },
    parse: (contextText, body) => parsedAnswer(parts, contextText, body),
  };
}

export function reparsed(
  kind: BotTaskKind,
  { context, result }: Readonly<Pick<BotTaskRow, "context" | "result">>,
): BotParse {
  return kind.parse(context ?? "", { result: parsedJson(z.json(), result ?? "") });
}
