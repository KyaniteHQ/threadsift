import { type SQL, sql } from "drizzle-orm";
import type { z } from "zod";

import { AI_DEADLINE_MS, type AiTaskDefinition, type ModelAi } from "./ai-contract.ts";
import { aiTaskRunning, completedAiTask, runAiTask } from "./ai-tasks.ts";
import { report } from "./failure-log.ts";
import { guardedOutcome, lostOutcome, refusalOutcome } from "./guarded-outcome.ts";
import type {
  ClaimedJob,
  JobOutcome,
  JobPorts,
  JobWrites,
  ModelHandler,
  SettledOutcome,
} from "./job-outcome.ts";
import type { WeeklyTask } from "./kinds.ts";
import type { Database } from "./ports.ts";

interface ModelRead<Sent> {
  readonly input: string;
  readonly inputRevision: number;
  readonly sent: Sent;
}

export interface WeeklyModelRun<Sent, Result> {
  readonly kind: WeeklyTask;
  readonly sent: z.ZodType<Sent>;
  readonly label: string;
  readonly event: string;
  readonly maxOutputTokens: number;
  readonly read: (db: Database) => Promise<ModelRead<Sent> | null>;
  readonly task: (sent: Sent) => AiTaskDefinition<Result>;
  readonly current: (sent: Sent) => SQL;
  readonly stored: (db: Database, done: Readonly<{ sent: Sent; result: Result }>) => JobWrites;
}

export function storedField<Value = unknown>(path: string): SQL<Value> {
  return sql<Value>`json_extract(stored.value, ${`$.${path}`})`;
}

export function storedOutcome<Sent, Result>(
  db: Database,
  run: Readonly<WeeklyModelRun<Sent, Result>>,
  { sent, taskId, result }: Readonly<{ sent: Sent; taskId: number; result: Result }>,
): SettledOutcome {
  return guardedOutcome(db, sql`${run.current(sent)} and ${aiTaskRunning(taskId)}`, {
    taskId,
    writes: [...run.stored(db, { sent, result }), completedAiTask(db, { taskId, result })],
  });
}

async function attemptRun<Sent, Result>(
  run: Readonly<WeeklyModelRun<Sent, Result>>,
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  ai: ModelAi,
): Promise<JobOutcome> {
  const { db } = ports;
  const read = await run.read(db);

  if (read === null) return guardedOutcome(db, sql`1`);

  const { input, inputRevision, sent } = read;

  const result = await runAiTask(
    ports,
    ai,
    run.task(sent),
    {
      text: input,
      inputRevision,
      attempts: job.attempts + 1,
      maxOutputTokens: run.maxOutputTokens,
    },
    job,
  );

  if (result.kind === "claim-lost") return lostOutcome(db);

  if (result.kind !== "done") {
    const refused = await refusalOutcome(db, job, {
      result,
      current: run.current(sent),
      label: run.label,
    });

    report(run.event, { reason: result.reason });

    return refused;
  }

  return storedOutcome(db, run, { sent, taskId: result.taskId, result: result.result });
}

export function weeklyModelHandler<Sent, Result>(
  run: Readonly<WeeklyModelRun<Sent, Result>>,
): ModelHandler {
  return {
    deadlineMs: AI_DEADLINE_MS,
    blockedBy: [],
    attempt: (ports, job, ai) => attemptRun(run, ports, job, ai),
    exhausted: () => [],
  };
}
