import { type SQLWrapper, sql } from "drizzle-orm";

import { type AiRefused, retriesAi } from "../contract/ai-contract.ts";
import { failedAiTask } from "./ai-task-rows.ts";
import type { Database } from "./database.ts";
import { insertGuard } from "./guards.ts";
import type {
  ClaimedJob,
  JobCurrency,
  JobOutcome,
  JobWrites,
  SettledOutcome,
} from "./job-outcome.ts";
import { isLastAttempt } from "./job-retry.ts";

interface Guarded {
  readonly taskId?: number | null;
  readonly writes?: JobWrites;
  readonly cleanup?: JobWrites;
}

export type GuardedOutcome = SettledOutcome & { readonly currency: JobCurrency };

function currency(
  db: Database,
  current: Readonly<SQLWrapper>,
  taskId: number | null,
  alsoOnDiscard: ReturnType<JobCurrency["discard"]> = [],
): JobCurrency {
  return {
    current: async () => {
      const [row] = await db.select({ current: sql<number>`${current}` }).from(sql`(select 1)`);

      return row?.current === 1;
    },
    discard: (cause) => [
      ...(taskId === null
        ? []
        : [
            failedAiTask(db, taskId, {
              reason: cause === "error" ? "unreachable" : cause,
              status: null,
            }),
          ]),
      ...alsoOnDiscard,
    ],
  };
}

export function guardedOutcome(
  db: Database,
  current: Readonly<SQLWrapper>,
  { taskId = null, writes = [], cleanup = [] }: Readonly<Guarded> = {},
): GuardedOutcome {
  return {
    currency: currency(db, current, taskId, cleanup),
    writes: [insertGuard(db, current, "outcome"), ...writes, ...cleanup],
  };
}

export function lostOutcome(
  db: Database,
  guarded: Readonly<Pick<Guarded, "taskId" | "cleanup">> = {},
): GuardedOutcome {
  return guardedOutcome(db, sql`0`, guarded);
}

export function lostClaim(db: Database): JobOutcome {
  return { writes: [insertGuard(db, sql`0`, "outcome")] };
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
  const { taskId } = result;
  const outcome = guardedOutcome(db, current, { taskId, writes, cleanup });

  if (retriable && !isLastAttempt(job.attempts)) {
    if (!(await outcome.currency.current())) return lostOutcome(db, { taskId, cleanup });

    throw new Error(`${label} ${result.reason}`);
  }

  return { ...outcome, failedAttempt: retriable };
}
