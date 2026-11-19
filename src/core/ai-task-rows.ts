import { type SQLWrapper, and, eq, isNotNull, sql } from "drizzle-orm";

import type { AiRefusal, Provider } from "./ai-contract.ts";
import { mayComplete, mayExpire, mayFail } from "./ai-task-state.ts";
import type { Database } from "./database.ts";
import { aiTasks } from "./schema.ts";

interface NewTask {
  readonly kind: string;
  readonly inputs: string;
  readonly inputRevision: number;
  readonly attempts: number;
  readonly deadline: number;
  readonly executor: string;
  readonly provider: Provider | null;
  readonly model: string | null;
  readonly itemId: number | null;
  readonly jobId: number | null;
  readonly callbackHash: string | null;
  readonly context: string | null;
}

export async function insertTask(
  db: Database,
  task: Readonly<NewTask>,
  condition: Readonly<SQLWrapper>,
) {
  const [inserted] = await db
    .insert(aiTasks)
    .select(
      db
        .select({
          id: sql<null>`null`.as("id"),
          kind: sql<string>`${task.kind}`.as("kind"),
          inputs: sql<string>`${task.inputs}`.as("inputs"),
          inputRevision: sql<number>`${task.inputRevision}`.as("input_revision"),
          executor: sql<string>`${task.executor}`.as("executor"),
          provider: sql<string | null>`${task.provider}`.as("provider"),
          model: sql<string | null>`${task.model}`.as("model"),
          attempts: sql<number>`${task.attempts}`.as("attempts"),
          deadline: sql<number>`${task.deadline}`.as("deadline"),
          state: sql<"running">`'running'`.as("state"),
          result: sql<null>`null`.as("result"),
          refusal: sql<null>`null`.as("refusal"),
          status: sql<null>`null`.as("status"),
          itemId: sql<number | null>`${task.itemId}`.as("item_id"),
          callbackHash: sql<string | null>`${task.callbackHash}`.as("callback_hash"),
          jobId: sql<number | null>`${task.jobId}`.as("job_id"),
          context: sql<string | null>`${task.context}`.as("context"),
          sentAt: sql<null>`null`.as("sent_at"),
          answeredAt: sql<null>`null`.as("answered_at"),
          answerRefusals: sql<number>`0`.as("answer_refusals"),
        })
        .from(sql`(select 1)`)
        .where(sql`${condition}`),
    )
    .returning({ id: aiTasks.id });

  return inserted ?? null;
}

interface CompletedTask<Result> {
  readonly taskId: number;
  readonly result: Result;
}

export function completedAiTask<Result>(db: Database, task: Readonly<CompletedTask<Result>>) {
  return db
    .update(aiTasks)
    .set({ state: "done", result: JSON.stringify(task.result), refusal: null, status: null })
    .where(and(eq(aiTasks.id, task.taskId), eq(aiTasks.state, "running"), mayComplete()));
}

type Failure = Readonly<{ reason: AiRefusal | "stale" | "lease-lost"; status: number | null }>;

function failingAiTask(db: Database, failure: Failure) {
  return db
    .update(aiTasks)
    .set({ state: "failed", result: null, refusal: failure.reason, status: failure.status });
}

export function failedAiTask(
  db: Database,
  taskId: number,
  failure: Failure,
  claim?: Readonly<SQLWrapper>,
) {
  return failingAiTask(db, failure).where(
    and(
      eq(aiTasks.id, taskId),
      eq(aiTasks.state, "running"),
      mayFail(failure.reason),
      claim && sql`${claim}`,
    ),
  );
}

export function givenUpTasks(db: Database, tasks: Readonly<SQLWrapper>) {
  const running = and(sql`${tasks}`, eq(aiTasks.state, "running"));

  return [
    failingAiTask(db, { reason: "timeout", status: null }).where(and(running, mayFail("timeout"))),
    failingAiTask(db, { reason: "stale", status: null }).where(
      and(running, isNotNull(aiTasks.answeredAt)),
    ),
  ] as const;
}

export function supersededTasks(db: Database, tasks: Readonly<SQLWrapper>) {
  return failingAiTask(db, { reason: "stale", status: null }).where(
    and(sql`${tasks}`, eq(aiTasks.state, "running"), mayFail("stale")),
  );
}

export function expireAiTasks(db: Database, now: number) {
  return failingAiTask(db, { reason: "timeout", status: null }).where(
    and(eq(aiTasks.state, "running"), mayExpire(now)),
  );
}
