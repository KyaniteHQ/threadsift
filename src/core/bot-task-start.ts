import { type SQL, sql } from "drizzle-orm";

import { insertTask } from "./ai-task-start.ts";
import { type BotTaskRow, GROK_BOT_EXECUTOR } from "./bot-task-states.ts";
import { newCallbackCredential } from "./callback-credential.ts";
import { guardHolds } from "./guards.ts";
import type { JobPorts } from "./job-outcome.ts";
import { holding } from "./job-rows.ts";
import type { JobKind } from "./kinds.ts";
import { type JobRow, aiTasks } from "./schema.ts";

export const GROK_BOT_IN_FLIGHT = 10;

export const GROK_BOT_WEEKLY_RESERVE = 3;

const WEEKLY_JOB_KINDS = new Set<JobKind>([
  "proposals",
  "topic_proposals",
  "disagreement_proposals",
]);

const BOT_TASK_DEADLINE_MS = 60 * 60 * 1000;

export interface BotTaskStart {
  readonly kind: string;
  readonly inputs: string;
  readonly inputRevision: number;
  readonly context: string;
  readonly deadlineMs?: number;
}

export interface BotOwner {
  readonly claim: SQL | undefined;
  readonly jobId: number | null;
  readonly itemId: number | null;
  readonly attempts: number;
  readonly places: number;
}

export const ownerOf = (job: Readonly<JobRow>): BotOwner => ({
  claim: holding(job),
  jobId: job.id,
  itemId: job.itemId,
  attempts: job.attempts + 1,
  places: WEEKLY_JOB_KINDS.has(job.kind)
    ? GROK_BOT_IN_FLIGHT
    : GROK_BOT_IN_FLIGHT - GROK_BOT_WEEKLY_RESERVE,
});

export const VERIFY_OWNER: BotOwner = {
  claim: undefined,
  jobId: null,
  itemId: null,
  attempts: 1,
  places: GROK_BOT_IN_FLIGHT - GROK_BOT_WEEKLY_RESERVE,
};

export type BotStarted =
  | {
      readonly kind: "started";
      readonly task: Readonly<Pick<BotTaskRow, "id" | "kind" | "inputs" | "context" | "deadline">>;
      readonly token: string;
    }
  | { readonly kind: "full" }
  | { readonly kind: "claim-lost" };

function underCap(now: number, places: number) {
  return sql`(select count(*) from ${aiTasks} where ${aiTasks.executor} = ${GROK_BOT_EXECUTOR} and ${aiTasks.state} = 'running' and ${aiTasks.answeredAt} is null and ${aiTasks.deadline} > ${now}) < ${places}`;
}

export async function startBotTask(
  { db, crypto }: Readonly<Pick<JobPorts, "db" | "crypto">>,
  owner: Readonly<BotOwner>,
  start: Readonly<BotTaskStart>,
): Promise<BotStarted> {
  const now = Date.now();
  const deadline = now + (start.deadlineMs ?? BOT_TASK_DEADLINE_MS);
  const credential = newCallbackCredential(crypto);
  const { claim } = owner;
  const cap = underCap(now, owner.places);

  const inserted = await insertTask(
    db,
    {
      kind: start.kind,
      inputs: start.inputs,
      inputRevision: start.inputRevision,
      attempts: owner.attempts,
      deadline,
      origin: { executor: GROK_BOT_EXECUTOR, provider: null, model: null },
      itemId: owner.itemId,
      bot: { jobId: owner.jobId, callbackHash: credential.hash, context: start.context },
    },
    claim === undefined ? cap : sql`${claim} and ${cap}`,
  );

  if (inserted !== null) {
    const { kind, inputs, context } = start;

    return {
      kind: "started",
      task: { id: inserted.id, kind, inputs, context, deadline },
      token: credential.value,
    };
  }

  return claim === undefined || (await guardHolds(db, claim))
    ? { kind: "full" }
    : { kind: "claim-lost" };
}
