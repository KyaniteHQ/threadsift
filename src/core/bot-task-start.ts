import { type SQL, type SQLWrapper, and, sql } from "drizzle-orm";

import { insertTask } from "./ai-task-rows.ts";
import { type AiTaskRow, GROK_BOT_EXECUTOR, awaitsAnswerBy } from "./ai-task-state.ts";
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
  readonly deadlineMs?: number;
  readonly holds?: Readonly<SQLWrapper>;
}

interface BotOwner {
  readonly claim: SQL | undefined;
  readonly jobId: number | null;
  readonly itemId: number | null;
  readonly attempts: number;
}

export const ownerOf = (job: Readonly<JobRow>): BotOwner => ({
  claim: holding(job),
  jobId: job.id,
  itemId: job.itemId,
  attempts: job.attempts + 1,
});

export const VERIFY_OWNER: BotOwner = {
  claim: undefined,
  jobId: null,
  itemId: null,
  attempts: 1,
};

type BotStarted =
  | {
      readonly kind: "started";
      readonly task: Readonly<Pick<AiTaskRow, "id" | "kind" | "inputs" | "context" | "deadline">>;
      readonly token: string;
    }
  | { readonly kind: "full" }
  | { readonly kind: "lease-lost" }
  | { readonly kind: "claim-lost" };

function underCap(now: number) {
  return sql`(select count(*) from ${aiTasks} where ${aiTasks.executor} = ${GROK_BOT_EXECUTOR} and ${awaitsAnswerBy(now)}) < ${GROK_BOT_IN_FLIGHT}`;
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
  const cap = underCap(now);

  const inserted = await insertTask(
    db,
    {
      kind: start.kind,
      inputs: start.inputs,
      inputRevision: start.inputRevision,
      attempts: owner.attempts,
      deadline,
      executor: GROK_BOT_EXECUTOR,
      provider: null,
      model: null,
      itemId: owner.itemId,
      jobId: owner.jobId,
      callbackHash: credential.hash,
      context: start.context,
    },
    and(claim, start.holds, cap) ?? cap,
  );

  if (inserted !== null) {
    const { kind, inputs, context } = start;

    return {
      kind: "started",
      task: { id: inserted.id, kind, inputs, context, deadline },
      token: credential.value,
    };
  }

  if (claim !== undefined && !(await guardHolds(db, claim))) return { kind: "claim-lost" };

  if (start.holds !== undefined && !(await guardHolds(db, start.holds))) {
    return { kind: "lease-lost" };
  }

  return { kind: "full" };
}
