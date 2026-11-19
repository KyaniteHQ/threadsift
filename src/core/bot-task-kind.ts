import { and, sql } from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";
import type { z } from "zod";

import type {
  AiKindDeclaration,
  BotOnlyDeclaration,
  IntakeFace,
  KindFace,
  ResultFace,
  Scope,
} from "./ai-kind-types.ts";
import { botAnswering } from "./bot-task-answering.ts";
import { appliedFor } from "./bot-task-apply.ts";
import type { Database } from "./database.ts";
import { guardHolds } from "./guards.ts";
import type { JobOutcome } from "./job-outcome.ts";
import { parsedJson } from "./parsed-json.ts";
import { grokBotChosen } from "./provider-saved.ts";

const BUSY_RETRY_MS = 15_000;

function currentOf<Context>(
  schema: z.ZodType<Context>,
  current: (context: Context) => Readonly<SQLWrapper>,
): KindFace["current"] {
  return async (db, contextText) => {
    const parsed = parsedJson(schema, contextText);

    return parsed !== null && (await guardHolds(db, current(parsed)));
  };
}

async function deferredByScope(
  db: Database,
  scope: Readonly<Scope> | null,
): Promise<JobOutcome | null> {
  if (scope === null || (await guardHolds(db, sql`not ${scope.open}`))) return null;

  return {
    deferredUntil: Date.now() + BUSY_RETRY_MS,
    wait: scope.wait,
    countsAttempt: false,
    writes: [],
  };
}

function preparedFor<Context, Result, Basis>(
  declaration: Readonly<AiKindDeclaration<Context, Result, Basis>>,
): KindFace["prepare"] {
  const { scope, prepare, current, task } = declaration;

  return async (ports, job) => {
    const held = (await scope?.(ports.db, job)) ?? null;
    const deferred = await deferredByScope(ports.db, held);

    if (deferred !== null) return { kind: "settled", outcome: deferred };

    const prepared = await prepare(ports, job);

    if (prepared.kind === "settled") return prepared;

    const { context } = prepared;
    const chosen = grokBotChosen();
    const scoped = held === null ? undefined : sql`not ${held.open} and ${current(context)}`;

    return {
      kind: "ask",
      start: {
        kind: task(context).kind,
        inputs: prepared.input,
        inputRevision: prepared.inputRevision,
        context: JSON.stringify(context),
        holds: and(scoped, chosen) ?? chosen,
      },
      started: prepared.started,
    };
  };
}

export function botFace<Context, Result, Basis>(
  declaration: Readonly<AiKindDeclaration<Context, Result, Basis>>,
): ResultFace {
  const { describe, parse } = botAnswering(declaration);

  return {
    answers: "result",
    prepare: preparedFor(declaration),
    current: currentOf(declaration.context, declaration.current),
    describe,
    parse,
    apply: appliedFor(declaration),
  };
}

export function botOnlyFace<Context>(
  declaration: Readonly<BotOnlyDeclaration<Context>>,
): IntakeFace {
  const { context, current, describe, kind, prepare } = declaration;

  return {
    answers: "intake",
    prepare: async (ports, job) => {
      const prepared = await prepare(ports, job);

      if (prepared.kind === "settled") return prepared;

      return {
        kind: "ask",
        start: {
          kind,
          inputs: prepared.input,
          inputRevision: prepared.inputRevision,
          context: JSON.stringify(prepared.context),
        },
      };
    },
    current: currentOf(context, current),
    describe: (contextText) => {
      const parsed = parsedJson(context, contextText);

      return parsed === null ? null : describe(parsed);
    },
  };
}
