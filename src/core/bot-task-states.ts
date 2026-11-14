import { type SQL, and, desc, eq, gt, isNotNull, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { DATABASE_NOW, guardHolds, guardedBatch } from "./guards.ts";
import { holding } from "./job-rows.ts";
import type { XReadNote } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { type JobRow, aiTasks, jobs } from "./schema.ts";
import { X_INTAKE_TASK } from "./x-intake-contract.ts";

export const GROK_BOT_EXECUTOR = "grok-bot";

export type BotTaskRow = typeof aiTasks.$inferSelect;

type BotTaskState = "unsent" | "sent" | "answered" | "applied" | "failed";

export type BotStep = "start" | "charge" | "apply" | "expire" | "resend" | "wait";

type Held = Readonly<Pick<JobRow, "id" | "attempts">>;

const BOT_ERROR_REFUSAL = "provider-busy";

const ABANDONED_REFUSAL = "abandoned";

const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;

const KEEPS_ANSWER_UNLESS = new Set<string>(["stale", "no-json"]);

export function stateOf(
  task: Readonly<Pick<BotTaskRow, "state" | "sentAt" | "answeredAt">>,
): BotTaskState {
  switch (task.state) {
    case "done":
      return "applied";
    case "failed":
      return "failed";
    case "running":
      if (task.answeredAt !== null) return "answered";

      return task.sentAt === null ? "unsent" : "sent";
    default: {
      const exhaustive: never = task.state;

      return exhaustive;
    }
  }
}

const REPORTED_ERROR = and(
  eq(aiTasks.state, "failed"),
  eq(aiTasks.refusal, BOT_ERROR_REFUSAL),
  isNotNull(aiTasks.answeredAt),
);

function reportedError(
  task: Readonly<Pick<BotTaskRow, "state" | "refusal" | "answeredAt">>,
): boolean {
  return task.state === "failed" && task.refusal === BOT_ERROR_REFUSAL && task.answeredAt !== null;
}

export function stepOf(
  task: Readonly<
    Pick<BotTaskRow, "state" | "sentAt" | "answeredAt" | "refusal" | "deadline">
  > | null,
  now: number,
): BotStep {
  if (task === null) return "start";

  const state = stateOf(task);

  switch (state) {
    case "applied":
      return "start";
    case "failed":
      return reportedError(task) ? "charge" : "start";
    case "answered":
      return "apply";
    case "unsent":
    case "sent":
      if (task.deadline <= now) return "expire";

      return state === "unsent" ? "resend" : "wait";
    default: {
      const exhaustive: never = state;

      return exhaustive;
    }
  }
}

export async function overviewAtBot(db: Database, topicId: number): Promise<boolean> {
  const [found] = await db
    .select({ id: aiTasks.id })
    .from(aiTasks)
    .where(
      and(
        eq(aiTasks.executor, GROK_BOT_EXECUTOR),
        eq(aiTasks.kind, "topic_overview"),
        eq(aiTasks.state, "running"),
        sql`json_extract(${aiTasks.context}, '$.topicId') = ${topicId}`,
        or(isNotNull(aiTasks.answeredAt), gt(aiTasks.deadline, Date.now())),
      ),
    )
    .limit(1);

  return found !== undefined;
}

export async function latestTask(db: Database, jobId: number): Promise<BotTaskRow | null> {
  const [task] = await db
    .select()
    .from(aiTasks)
    .where(eq(aiTasks.jobId, jobId))
    .orderBy(desc(aiTasks.id))
    .limit(1);

  return task ?? null;
}

export function botFailureNote(jobId: number) {
  const unanswered = sql`(${aiTasks.state} = 'running' and ${aiTasks.answeredAt} is null) or (${aiTasks.state} = 'failed' and ${aiTasks.refusal} = 'timeout')`;

  return sql<XReadNote | null>`(select case when ${unanswered} then 'bot-timed-out' else 'bot-failed' end from ${aiTasks} where ${aiTasks.jobId} = ${jobId} and ${aiTasks.kind} = ${X_INTAKE_TASK} order by ${aiTasks.id} desc limit 1)`;
}

export async function hasOpenIntakeTask(db: Database, jobId: number): Promise<boolean> {
  const task = await latestTask(db, jobId);

  return task !== null && task.kind === X_INTAKE_TASK && task.state === "running";
}

export function mayFail(reason: string): SQL | undefined {
  return KEEPS_ANSWER_UNLESS.has(reason) ? undefined : isNull(aiTasks.answeredAt);
}

export function mayComplete(): SQL | undefined {
  return or(ne(aiTasks.executor, GROK_BOT_EXECUTOR), isNotNull(aiTasks.answeredAt));
}

export function mayExpire(now: number): SQL | undefined {
  return or(
    and(lt(aiTasks.deadline, now), isNull(aiTasks.answeredAt), isNull(aiTasks.jobId)),
    lt(aiTasks.deadline, now - ABANDONED_AFTER_MS),
  );
}

export async function sentTask(
  db: Database,
  claim: SQL | undefined,
  { taskId, now }: Readonly<{ taskId: number; now: number }>,
): Promise<void> {
  await db
    .update(aiTasks)
    .set({ sentAt: now })
    .where(
      and(eq(aiTasks.id, taskId), eq(aiTasks.state, "running"), isNull(aiTasks.sentAt), claim),
    );
}

export async function renewedCredential(
  db: Database,
  job: Readonly<Held>,
  { taskId, callbackHash }: Readonly<{ taskId: number; callbackHash: string }>,
): Promise<boolean> {
  const [renewed] = await db
    .update(aiTasks)
    .set({ callbackHash, answerRefusals: 0 })
    .where(
      and(
        eq(aiTasks.id, taskId),
        eq(aiTasks.state, "running"),
        isNull(aiTasks.sentAt),
        isNull(aiTasks.answeredAt),
        holding(job),
      ),
    )
    .returning({ id: aiTasks.id });

  return renewed !== undefined;
}

export function acceptsAnswer(task: Readonly<Pick<BotTaskRow, "id" | "callbackHash">>) {
  return sql`exists (select 1 from ${aiTasks} where ${aiTasks.id} = ${task.id} and ${aiTasks.callbackHash} = ${task.callbackHash} and ${aiTasks.state} = 'running' and ${aiTasks.answeredAt} is null and ${aiTasks.deadline} > ${DATABASE_NOW})`;
}

function open(taskId: number) {
  return and(eq(aiTasks.id, taskId), eq(aiTasks.state, "running"), isNull(aiTasks.answeredAt));
}

function jobDue(
  db: Database,
  task: Readonly<Pick<BotTaskRow, "jobId">>,
  now: number,
): readonly BatchItem<"sqlite">[] {
  if (task.jobId === null) return [];

  return [
    db
      .update(jobs)
      .set({ nextAttemptAt: now })
      .where(and(eq(jobs.id, task.jobId), ne(jobs.state, "done"))),
  ];
}

export function answeredWrites(
  db: Database,
  task: Readonly<Pick<BotTaskRow, "id" | "jobId">>,
  { resultText, now }: Readonly<{ resultText: string; now: number }>,
): readonly BatchItem<"sqlite">[] {
  return [
    db.update(aiTasks).set({ result: resultText, answeredAt: now }).where(open(task.id)),
    ...jobDue(db, task, now),
  ];
}

export function reportedWrites(
  db: Database,
  task: Readonly<Pick<BotTaskRow, "id" | "jobId">>,
  now: number,
): readonly BatchItem<"sqlite">[] {
  return [
    db
      .update(aiTasks)
      .set({ state: "failed", result: null, refusal: BOT_ERROR_REFUSAL, answeredAt: now })
      .where(open(task.id)),
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
  const expired = and(open(taskId), lte(aiTasks.deadline, now));

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

export function givenUpTasks(db: Database, job: Readonly<Pick<JobRow, "id">>) {
  return db
    .update(aiTasks)
    .set({
      state: "failed",
      result: null,
      refusal: sql`case when ${aiTasks.answeredAt} is null then 'timeout' else 'stale' end`,
      status: null,
    })
    .where(and(eq(aiTasks.jobId, job.id), eq(aiTasks.state, "running")));
}

export function abandonedTasks(db: Database, now: number): readonly BatchItem<"sqlite">[] {
  const providerTasks = and(
    eq(aiTasks.executor, GROK_BOT_EXECUTOR),
    eq(aiTasks.state, "running"),
    ne(aiTasks.kind, X_INTAKE_TASK),
  );

  return [
    db
      .update(aiTasks)
      .set({ state: "failed", result: null, refusal: ABANDONED_REFUSAL, status: null })
      .where(providerTasks),
    db
      .update(jobs)
      .set({ nextAttemptAt: now })
      .where(
        and(eq(jobs.state, "queued"), eq(jobs.waitReason, "grok-bot"), ne(jobs.kind, "fetch")),
      ),
  ];
}
