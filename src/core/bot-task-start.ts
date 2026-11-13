import { sql } from "drizzle-orm";

import { insertTask } from "./ai-task-start.ts";
import { type BotTaskRow, GROK_BOT_EXECUTOR } from "./bot-task-states.ts";
import { newCallbackCredential } from "./callback-credential.ts";
import { guardHolds } from "./guards.ts";
import type { JobPorts } from "./job-outcome.ts";
import { holding } from "./job-rows.ts";
import { type JobRow, aiTasks } from "./schema.ts";

export const GROK_BOT_IN_FLIGHT = 10;

const BOT_TASK_DEADLINE_MS = 60 * 60 * 1000;

export interface BotTaskStart {
  readonly kind: string;
  readonly inputs: string;
  readonly inputRevision: number;
  readonly context: string;
}

export type BotStarted =
  | {
      readonly kind: "started";
      readonly task: Readonly<Pick<BotTaskRow, "id" | "kind" | "inputs" | "context" | "deadline">>;
      readonly token: string;
    }
  | { readonly kind: "full" }
  | { readonly kind: "claim-lost" };

function underCap(now: number) {
  return sql`(select count(*) from ${aiTasks} where ${aiTasks.executor} = ${GROK_BOT_EXECUTOR} and ${aiTasks.state} = 'running' and (${aiTasks.answeredAt} is not null or ${aiTasks.deadline} > ${now})) < ${GROK_BOT_IN_FLIGHT}`;
}

export async function startBotTask(
  { db, crypto }: Readonly<Pick<JobPorts, "db" | "crypto">>,
  job: Readonly<JobRow>,
  start: Readonly<BotTaskStart>,
): Promise<BotStarted> {
  const now = Date.now();
  const deadline = now + BOT_TASK_DEADLINE_MS;
  const credential = newCallbackCredential(crypto);

  const inserted = await insertTask(
    db,
    {
      kind: start.kind,
      inputs: start.inputs,
      inputRevision: start.inputRevision,
      attempts: job.attempts + 1,
      deadline,
      origin: { executor: GROK_BOT_EXECUTOR, provider: null, model: null },
      itemId: job.itemId,
      bot: { jobId: job.id, callbackHash: credential.hash, context: start.context },
    },
    sql`${holding(job)} and ${underCap(now)}`,
  );

  if (inserted !== null) {
    const { kind, inputs, context } = start;

    return {
      kind: "started",
      task: { id: inserted.id, kind, inputs, context, deadline },
      token: credential.value,
    };
  }

  return (await guardHolds(db, holding(job))) ? { kind: "full" } : { kind: "claim-lost" };
}
