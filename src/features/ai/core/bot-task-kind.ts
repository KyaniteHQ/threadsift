import { and, sql } from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";
import type { z } from "zod";

import type { Database } from "../../../core/kernel/database.ts";
import { lostOutcome } from "../../../core/kernel/guarded-outcome.ts";
import { guardHolds } from "../../../core/kernel/guards.ts";
import type { JobOutcome } from "../../../core/kernel/job-outcome.ts";
import { parsedJson } from "../../../core/kernel/parsed-json.ts";
import { grokBotChosen } from "../../../core/kernel/provider-saved.ts";
import type {
  AiKindDeclaration,
  BotOnlyDeclaration,
  Deferral,
  KindFace,
  ResultFace,
} from "./ai-kind-types.ts";
import { botAnswering } from "./bot-task-answering.ts";
import { appliedFor } from "./bot-task-apply.ts";

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

async function deferredBy(
  db: Database,
  deferral: Readonly<Deferral> | null,
): Promise<JobOutcome | null> {
  if (deferral === null || (await guardHolds(db, sql`not ${deferral.busy}`))) return null;

  return {
    deferredUntil: Date.now() + BUSY_RETRY_MS,
    wait: deferral.wait,
    countsAttempt: false,
    writes: [],
  };
}

function preparedFor<Context, Result, Basis>(
  declaration: Readonly<AiKindDeclaration<Context, Result, Basis>>,
): KindFace["prepare"] {
  const { defer, holds, prepare, kind } = declaration;

  return async (ports, job) => {
    const deferred = await deferredBy(ports.db, (await defer?.(ports.db, job)) ?? null);

    if (deferred !== null) return { kind: "settled", outcome: deferred };

    const prepared = await prepare(ports, job);

    if (prepared.kind === "settled") return prepared;

    const { context } = prepared;
    const chosen = grokBotChosen();

    return {
      kind: "ask",
      start: {
        kind,
        inputs: prepared.input,
        inputRevision: prepared.inputRevision,
        context: JSON.stringify(context),
        holds: and(holds?.(context), chosen) ?? chosen,
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
    prepare: preparedFor(declaration),
    current: currentOf(declaration.context, declaration.current),
    describe,
    parse,
    apply: appliedFor(declaration),
  };
}

export function botOnlyFace<Context>(declaration: Readonly<BotOnlyDeclaration<Context>>): KindFace {
  const { context, current, describe, kind, prepare } = declaration;

  return {
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
    apply: ({ db }, _job, task) => Promise.resolve(lostOutcome(db, { taskId: task.id })),
  };
}
