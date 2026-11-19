import { type SQL, type SQLWrapper, and, desc, eq, lte, ne, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import {
  type AiTaskRow,
  BOT_ERROR_REFUSAL,
  GROK_BOT_EXECUTOR,
  NOT_SENT,
  REPORTED_ERROR,
  RUNNING,
  UNSENT,
  openTask,
  resendDue,
  resendRequested,
} from "./ai-task-state.ts";
import type { Database } from "./database.ts";
import { guardHolds, guardedBatch } from "./guards.ts";
import { holding, wokenJob } from "./job-rows.ts";
import { type JobRow, aiTasks } from "./schema.ts";

type Held = Readonly<Pick<JobRow, "id" | "attempts" | "attemptGeneration">>;

const ABANDONED_REFUSAL = "abandoned";

export async function latestTask(db: Database, jobId: number): Promise<AiTaskRow | null> {
  const [task] = await db
    .select()
    .from(aiTasks)
    .where(eq(aiTasks.jobId, jobId))
    .orderBy(desc(aiTasks.id))
    .limit(1);

  return task ?? null;
}

export async function sentTask(
  db: Database,
  claim: SQL | undefined,
  { taskId, now }: Readonly<{ taskId: number; now: number }>,
): Promise<void> {
  await db
    .update(aiTasks)
    .set({ sentAt: now })
    .where(and(eq(aiTasks.id, taskId), RUNNING, NOT_SENT, claim));
}

export async function renewedCredential(
  db: Database,
  job: Readonly<Held>,
  { taskId, callbackHash }: Readonly<{ taskId: number; callbackHash: string }>,
): Promise<boolean> {
  const [renewed] = await db
    .update(aiTasks)
    .set({ callbackHash, answerRefusals: 0 })
    .where(and(eq(aiTasks.id, taskId), UNSENT, holding(job)))
    .returning({ id: aiTasks.id });

  return renewed !== undefined;
}

function jobDue(
  db: Database,
  task: Readonly<Pick<AiTaskRow, "jobId">>,
  now: number,
): readonly BatchItem<"sqlite">[] {
  if (task.jobId === null) return [];

  return [wokenJob(db, task.jobId, now)];
}

export function answeredWrites(
  db: Database,
  task: Readonly<Pick<AiTaskRow, "id" | "jobId">>,
  { resultText, now }: Readonly<{ resultText: string; now: number }>,
): readonly BatchItem<"sqlite">[] {
  return [
    db.update(aiTasks).set({ result: resultText, answeredAt: now }).where(openTask(task.id)),
    ...jobDue(db, task, now),
  ];
}

export function reportedWrites(
  db: Database,
  task: Readonly<Pick<AiTaskRow, "id" | "jobId">>,
  now: number,
): readonly BatchItem<"sqlite">[] {
  return [
    db
      .update(aiTasks)
      .set({ state: "failed", result: null, refusal: BOT_ERROR_REFUSAL, answeredAt: now })
      .where(openTask(task.id)),
    ...jobDue(db, task, now),
  ];
}

export async function chargedReport(
  db: Database,
  job: Readonly<Held>,
  taskId: number,
): Promise<void> {
  await guardedBatch(db, holding(job), [
    db
      .update(aiTasks)
      .set({ answeredAt: null })
      .where(and(eq(aiTasks.id, taskId), REPORTED_ERROR)),
  ]);
}

type TimeOut = "timed-out" | "claim-lost" | "changed";

export async function timedOutTask(
  db: Database,
  job: Readonly<Held>,
  { taskId, now }: Readonly<{ taskId: number; now: number }>,
): Promise<TimeOut> {
  const expired = and(openTask(taskId), lte(aiTasks.deadline, now));

  const wrote = await guardedBatch(
    db,
    sql`${holding(job)} and exists (select 1 from ${aiTasks} where ${expired})`,
    [
      db
        .update(aiTasks)
        .set({ state: "failed", result: null, refusal: "timeout", status: null })
        .where(expired),
    ],
  );

  if (wrote) return "timed-out";

  return (await guardHolds(db, holding(job))) ? "changed" : "claim-lost";
}

export function abandonedTasks(db: Database, keeping: string) {
  return db
    .update(aiTasks)
    .set({ state: "failed", result: null, refusal: ABANDONED_REFUSAL, status: null })
    .where(and(eq(aiTasks.executor, GROK_BOT_EXECUTOR), RUNNING, ne(aiTasks.kind, keeping)));
}

export function answeredTask(db: Database, taskId: number, now: number) {
  return db
    .update(aiTasks)
    .set({ answeredAt: now })
    .where(and(eq(aiTasks.id, taskId), RUNNING));
}

export async function countedRefusal(
  db: Database,
  task: Readonly<{ id: number; jobId: number }>,
  live: Readonly<SQLWrapper>,
  now: number,
) {
  const refused = sql`${aiTasks.answerRefusals} + 1`;

  const [counted] = await db.batch([
    db
      .update(aiTasks)
      .set({
        answerRefusals: refused,
        deadline: sql`case when ${resendDue(refused)} then ${now} else ${aiTasks.deadline} end`,
      })
      .where(and(eq(aiTasks.id, task.id), live))
      .returning({
        refusals: aiTasks.answerRefusals,
        resend: resendDue(aiTasks.answerRefusals).mapWith(Boolean),
      }),
    wokenJob(db, task.jobId, now, resendRequested(task.id, now)),
  ]);

  return counted[0] ?? null;
}
