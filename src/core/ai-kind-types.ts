import type { SQL, SQLWrapper } from "drizzle-orm";
import type { z } from "zod";

import type { AiRefusal, AiTaskDefinition } from "./ai-contract.ts";
import type { AiTaskRow, GROK_BOT_EXECUTOR } from "./ai-task-state.ts";
import type { BotAnswering, BotInstructions } from "./bot-task-answering.ts";
import type { BotTaskStart } from "./bot-task-start.ts";
import type { Database } from "./database.ts";
import type { GuardedOutcome } from "./guarded-outcome.ts";
import type { WaitReason } from "./job-contract.ts";
import type { ClaimedJob, JobOutcome, JobPorts, JobWrites } from "./job-outcome.ts";

interface BotAsk<Context> {
  readonly kind: "ask";
  readonly context: Context;
  readonly input: string;
  readonly inputRevision: number;
}

export interface Asked<Context, Basis> extends BotAsk<Context> {
  readonly maxOutputTokens: number;
  readonly basis: Basis;
  readonly started?: ((taskId: number) => void) | undefined;
}

export type PlainAsked<Context> = Omit<Asked<Context, undefined>, "basis">;

type Prepared<Ask> = { readonly kind: "settled"; readonly outcome: JobOutcome } | Ask;

interface Answerer {
  readonly provider: string;
  readonly model: string | null;
}

interface Answering<Context, Result> {
  readonly context: Context;
  readonly result: Result;
  readonly taskId: number;
  readonly by: Answerer;
}

export type Answered<Context, Result, Basis> = Answering<Context, Result> &
  (
    | { readonly executor: "model"; readonly basis: Basis }
    | { readonly executor: typeof GROK_BOT_EXECUTOR }
  );

export interface Stored<Result = never> {
  readonly writes: JobWrites;
  readonly also?: SQLWrapper | undefined;
  readonly result?: Result | undefined;
  readonly continuation?: JobWrites | undefined;
  readonly settle?: ((outcome: GuardedOutcome) => JobOutcome | Promise<JobOutcome>) | undefined;
}

interface Refusal {
  readonly writes?: JobWrites | undefined;
  readonly event?: string | undefined;
}

export interface Deferral {
  readonly busy: SQL;
  readonly wait: WaitReason;
}

type Prepare<Ask> = (ports: JobPorts, job: Readonly<ClaimedJob>) => Promise<Prepared<Ask>>;

export interface AiKindDeclaration<Context, Result, Basis> {
  readonly kind: string;
  readonly context: z.ZodType<Context>;
  readonly label: string;
  readonly task: (context: Context) => AiTaskDefinition<Result>;
  readonly current: (context: Context) => SQLWrapper;
  readonly holds?: ((context: Context) => SQLWrapper) | undefined;
  readonly defer?:
    | ((db: Database, job: Readonly<ClaimedJob>) => Promise<Deferral | null>)
    | undefined;
  readonly prepare: Prepare<Asked<Context, Basis>>;
  readonly publish: (
    db: Database,
    answered: Readonly<Answered<Context, Result, Basis>>,
  ) => Stored<Result> | Promise<Stored<Result>>;
  readonly refused?: ((db: Database, context: Context, reason: AiRefusal) => Refusal) | undefined;
}

export type PlainDeclaration<Context, Result> = Omit<
  AiKindDeclaration<Context, Result, undefined>,
  "prepare"
> & { readonly prepare: Prepare<PlainAsked<Context>> };

export interface BotOnlyDeclaration<Context> {
  readonly kind: string;
  readonly context: z.ZodType<Context>;
  readonly current: (context: Context) => SQLWrapper;
  readonly describe: (context: Context) => BotInstructions;
  readonly prepare: Prepare<BotAsk<Context>>;
}

type BotPreparation =
  | {
      readonly kind: "ask";
      readonly start: BotTaskStart;
      readonly started?: ((taskId: number) => void) | undefined;
    }
  | { readonly kind: "settled"; readonly outcome: JobOutcome };

export type SentTask = Readonly<Pick<AiTaskRow, "id" | "kind" | "context">>;

export interface KindFace {
  readonly prepare: (ports: JobPorts, job: Readonly<ClaimedJob>) => Promise<BotPreparation>;
  readonly current: (db: Database, context: string) => Promise<boolean>;
  readonly describe: BotAnswering["describe"];
  readonly apply: (
    ports: JobPorts,
    job: Readonly<ClaimedJob>,
    task: Readonly<AiTaskRow>,
  ) => Promise<JobOutcome>;
}

export interface ResultFace extends KindFace, BotAnswering {}

type Attempt = (ports: JobPorts, job: Readonly<ClaimedJob>) => Promise<JobOutcome>;

export interface BotTaskKind extends ResultFace {
  readonly attempt: Attempt;
}

export interface IntakeKind extends KindFace {
  readonly attempt: Attempt;
}
