import { type SQLWrapper, sql } from "drizzle-orm";

import { type AiRefused, retriesAi } from "./ai-contract.ts";
import { currency } from "./digest-source.ts";
import { insertGuard } from "./guards.ts";
import {
  type ClaimedJob,
  type JobCurrency,
  type JobWrites,
  type SettledOutcome,
  isLastAttempt,
} from "./job-outcome.ts";
import type { Database } from "./ports.ts";

interface Guarded {
  readonly taskId?: number | null;
  readonly writes?: JobWrites;
  readonly cleanup?: JobWrites;
}

type GuardedOutcome = SettledOutcome & { readonly currency: JobCurrency };

export function guardedOutcome(
  db: Database,
  current: Readonly<SQLWrapper>,
  { taskId = null, writes = [], cleanup = [] }: Readonly<Guarded> = {},
): GuardedOutcome {
  return {
    currency: currency(db, current, taskId, cleanup),
    writes: [insertGuard(db, current), ...writes, ...cleanup],
  };
}

export function lostOutcome(db: Database): GuardedOutcome {
  return guardedOutcome(db, sql`0`);
}

export async function refusalOutcome(
  db: Database,
  job: Readonly<ClaimedJob>,
  {
    result,
    current,
    label,
    writes = [],
    cleanup = [],
  }: Readonly<
    Guarded & {
      result: Readonly<AiRefused & { readonly taskId: number | null }>;
      current: Readonly<SQLWrapper>;
      label: string;
    }
  >,
): Promise<SettledOutcome> {
  const retriable = retriesAi(result);
  const outcome = guardedOutcome(db, current, { taskId: result.taskId, writes, cleanup });

  if (retriable && !isLastAttempt(job.attempts) && (await outcome.currency.current())) {
    throw new Error(`${label} ${result.reason}`);
  }

  return { ...outcome, failedAttempt: retriable };
}
