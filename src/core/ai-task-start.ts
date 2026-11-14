import { type SQLWrapper, sql } from "drizzle-orm";

import { type AiConnection, type Provider, AI_DEADLINE_MS, modelOf } from "./ai-contract.ts";
import { holding } from "./job-rows.ts";
import type { AiPorts, Database } from "./ports.ts";
import { type JobRow, aiTasks } from "./schema.ts";

export type TaskOwner = Readonly<Pick<JobRow, "id" | "attempts" | "attemptGeneration" | "itemId">>;

export interface TaskOrigin {
  readonly executor: string;
  readonly provider: Provider | null;
  readonly model: string | null;
}

export function originOf(config: Readonly<AiConnection>): TaskOrigin {
  return { executor: config.kind, provider: config.provider, model: modelOf(config) };
}

interface BotColumns {
  readonly jobId: number | null;
  readonly callbackHash: string;
  readonly context: string;
}

interface NewTask {
  readonly kind: string;
  readonly inputs: string;
  readonly inputRevision: number;
  readonly attempts: number;
  readonly deadline: number;
  readonly origin: Readonly<TaskOrigin>;
  readonly itemId: number | null;
  readonly bot: Readonly<BotColumns> | null;
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
          executor: sql<string>`${task.origin.executor}`.as("executor"),
          provider: sql<string | null>`${task.origin.provider}`.as("provider"),
          model: sql<string | null>`${task.origin.model}`.as("model"),
          attempts: sql<number>`${task.attempts}`.as("attempts"),
          deadline: sql<number>`${task.deadline}`.as("deadline"),
          state: sql<"running">`'running'`.as("state"),
          result: sql<null>`null`.as("result"),
          refusal: sql<null>`null`.as("refusal"),
          status: sql<null>`null`.as("status"),
          itemId: sql<number | null>`${task.itemId}`.as("item_id"),
          callbackHash: sql<string | null>`${task.bot?.callbackHash ?? null}`.as("callback_hash"),
          jobId: sql<number | null>`${task.bot?.jobId ?? null}`.as("job_id"),
          context: sql<string | null>`${task.bot?.context ?? null}`.as("context"),
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

export function startTask(
  ports: AiPorts,
  kind: string,
  text: string,
  input: Readonly<{ inputRevision: number; attempts: number }>,
  origin: Readonly<TaskOrigin>,
  owner: TaskOwner | null,
) {
  return insertTask(
    ports.db,
    {
      kind,
      inputs: text,
      inputRevision: input.inputRevision,
      attempts: input.attempts,
      deadline: Date.now() + AI_DEADLINE_MS,
      origin,
      itemId: owner?.itemId ?? null,
      bot: null,
    },
    owner === null ? sql`1` : holding(owner),
  );
}
