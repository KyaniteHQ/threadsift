import { type SQL, type SQLWrapper, and, eq, sql } from "drizzle-orm";

import type { AiRefusal } from "../contract/ai-contract.ts";
import type { Provider } from "../contract/provider-families.ts";
import { ANSWERED, RUNNING, mayComplete, mayExpire, mayFail, refusedAs } from "./ai-task-state.ts";
import type { Database } from "./database.ts";
import { holdsNoRow } from "./guards.ts";
import { heldBatch } from "./restore-hold.ts";
import { aiTasks, digests, items } from "./schema.ts";

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
  const insert = db
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
  const written = await heldBatch(db, [insert] as const);
  const [inserted] = written?.[0] ?? [];

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
    .where(and(eq(aiTasks.id, task.taskId), RUNNING, mayComplete()));
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
    and(eq(aiTasks.id, taskId), RUNNING, mayFail(failure.reason), claim && sql`${claim}`),
  );
}

export function givenUpTasks(db: Database, tasks: Readonly<SQLWrapper>) {
  const running = and(sql`${tasks}`, RUNNING);

  return [
    failingAiTask(db, { reason: "timeout", status: null }).where(and(running, mayFail("timeout"))),
    failingAiTask(db, { reason: "stale", status: null }).where(and(running, ANSWERED)),
  ] as const;
}

export function supersededTasks(db: Database, tasks: Readonly<SQLWrapper>) {
  return failingAiTask(db, { reason: "stale", status: null }).where(
    and(sql`${tasks}`, RUNNING, mayFail("stale")),
  );
}

export function expireAiTasks(db: Database, now: number) {
  return failingAiTask(db, { reason: "timeout", status: null }).where(and(RUNNING, mayExpire(now)));
}

export function deletedUndigestedTasks(db: Database, scope: Readonly<SQLWrapper>) {
  return db
    .delete(aiTasks)
    .where(and(sql`${scope}`, holdsNoRow(db, digests, eq(digests.taskId, aiTasks.id))));
}

export function lastDigestRefusedKey(): SQL {
  return sql`exists (select 1 from ${aiTasks} where ${aiTasks.itemId} = ${items.id} and ${aiTasks.kind} = 'digest' and ${refusedAs("wrong-key")} and ${aiTasks.id} = (select max(latest.id) from ${aiTasks} as latest where latest.item_id = ${items.id} and latest.kind = 'digest'))`;
}
