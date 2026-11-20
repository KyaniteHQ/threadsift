import {
  type SQL,
  type SQLWrapper,
  and,
  eq,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";

import { DAY_MS } from "../contract/time-units.ts";
import { aiTasks } from "./schema.ts";
import { DATABASE_NOW } from "./sql-expressions.ts";

export const GROK_BOT_EXECUTOR = "grok-bot";

export const BOT_ERROR_REFUSAL = "provider-busy";

export type AiTaskRow = typeof aiTasks.$inferSelect;

type BotTaskState = "unsent" | "sent" | "answered" | "applied" | "failed";

export type BotStep = "start" | "charge" | "apply" | "expire" | "resend" | "wait";

const ABANDONED_AFTER_MS = DAY_MS;

const KEEPS_ANSWER_UNLESS = new Set<string>(["stale", "no-json"]);

const REFUSALS_BEFORE_RESEND = 2;

export function stateOf(
  task: Readonly<Pick<AiTaskRow, "state" | "sentAt" | "answeredAt">>,
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

function reportedError(
  task: Readonly<Pick<AiTaskRow, "state" | "refusal" | "answeredAt">>,
): boolean {
  return task.state === "failed" && task.refusal === BOT_ERROR_REFUSAL && task.answeredAt !== null;
}

export const REPORTED_ERROR = and(
  eq(aiTasks.state, "failed"),
  eq(aiTasks.refusal, BOT_ERROR_REFUSAL),
  isNotNull(aiTasks.answeredAt),
);

export const RUNNING = sql`${aiTasks.state} = 'running'`;

export function isRunning(task: Readonly<Pick<AiTaskRow, "state">>): boolean {
  return task.state === "running";
}

export const ANSWERED = isNotNull(aiTasks.answeredAt);

export const UNANSWERED = sql`${RUNNING} and ${aiTasks.answeredAt} is null`;

export function awaitsAnswer(
  task: Readonly<Pick<AiTaskRow, "state" | "sentAt" | "answeredAt" | "deadline">>,
  now: number,
): boolean {
  const state = stateOf(task);

  return (state === "unsent" || state === "sent") && task.deadline > now;
}

export function awaitsAnswerBy(by: Readonly<SQLWrapper> | number): SQL {
  return sql`${UNANSWERED} and ${aiTasks.deadline} > ${by}`;
}

export const NOT_SENT = sql`${aiTasks.sentAt} is null`;

export const UNSENT = sql`${UNANSWERED} and ${NOT_SENT}`;

export function refusedAs(refusal: string): SQL {
  return sql`${aiTasks.state} = 'failed' and ${aiTasks.refusal} = ${refusal}`;
}

export const TIMED_OUT = refusedAs("timeout");

export function answeredOrBefore(now: number): SQL {
  return sql`(${aiTasks.answeredAt} is not null or ${aiTasks.deadline} > ${now})`;
}

export function openTask(taskId: number) {
  return and(eq(aiTasks.id, taskId), UNANSWERED);
}

export function aiTaskRunning(taskId: number) {
  return sql`exists (select 1 from ${aiTasks} where ${aiTasks.id} = ${taskId} and ${RUNNING})`;
}

export function answeredOrClosed(taskId: number) {
  return sql`exists (select 1 from ${aiTasks} where ${aiTasks.id} = ${taskId} and not (${UNANSWERED}))`;
}

export function acceptsAnswer(task: Readonly<Pick<AiTaskRow, "id" | "callbackHash">>) {
  return sql`exists (select 1 from ${aiTasks} where ${aiTasks.id} = ${task.id} and ${aiTasks.callbackHash} = ${task.callbackHash} and ${awaitsAnswerBy(DATABASE_NOW)})`;
}

export function resendDue(refusals: Readonly<SQLWrapper>): SQL {
  return sql`${refusals} >= ${REFUSALS_BEFORE_RESEND}`;
}

export function resendRequested(taskId: number, now: number) {
  return sql`exists (select 1 from ${aiTasks} where ${aiTasks.id} = ${taskId} and ${UNANSWERED} and ${aiTasks.deadline} = ${now} and ${resendDue(aiTasks.answerRefusals)})`;
}

export function mayFail(reason: string): SQL | undefined {
  return KEEPS_ANSWER_UNLESS.has(reason) ? undefined : isNull(aiTasks.answeredAt);
}

export function mayComplete(): SQL | undefined {
  return or(ne(aiTasks.executor, GROK_BOT_EXECUTOR), ANSWERED);
}

export function mayExpire(now: number): SQL | undefined {
  return or(
    and(lt(aiTasks.deadline, now), isNull(aiTasks.answeredAt), isNull(aiTasks.jobId)),
    lt(aiTasks.deadline, now - ABANDONED_AFTER_MS),
  );
}

export function stepOf(
  task: Readonly<
    Pick<AiTaskRow, "state" | "sentAt" | "answeredAt" | "refusal" | "deadline">
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
