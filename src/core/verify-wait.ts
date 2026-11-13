import { eq } from "drizzle-orm";
import type { z } from "zod";

import {
  AiRefusalSchema,
  ModelDigestSchema,
  type VerifyResultSchema,
  refusedAi,
} from "./ai-contract.ts";
import { completedAiTask, failedAiTask } from "./ai-tasks.ts";
import { type BotTaskRow, stateOf } from "./bot-task-states.ts";
import { VERIFY_WAIT_MS } from "./grok-bot-contract.ts";
import { parsedJson } from "./parsed-json.ts";
import { pause } from "./pause.ts";
import { HOP_DEADLINE_MS, type Database } from "./ports.ts";
import { aiTasks } from "./schema.ts";

export const VERIFY_DEADLINE_MS = VERIFY_WAIT_MS + HOP_DEADLINE_MS;

const VERIFY_POLL_MS = 1000;

type Verified = z.infer<typeof VerifyResultSchema>;

type VerifyStage =
  | { readonly kind: "waiting" }
  | { readonly kind: "answered" }
  | { readonly kind: "failed" }
  | { readonly kind: "timed-out" };

function verifyStage(
  task: Readonly<Pick<BotTaskRow, "state" | "sentAt" | "answeredAt" | "deadline">>,
  { now, endsAt }: Readonly<{ now: number; endsAt: number }>,
): VerifyStage {
  const state = stateOf(task);

  switch (state) {
    case "unsent":
    case "sent":
      return now >= Math.min(endsAt, task.deadline) ? { kind: "timed-out" } : { kind: "waiting" };
    case "answered":
    case "applied":
      return { kind: "answered" };
    case "failed":
      return { kind: "failed" };
    default: {
      const exhaustive: never = state;

      return exhaustive;
    }
  }
}

async function readTask(db: Database, taskId: number) {
  const [task] = await db.select().from(aiTasks).where(eq(aiTasks.id, taskId));

  return task ?? null;
}

function refusalOf({ refusal, status }: Readonly<Pick<BotTaskRow, "refusal" | "status">>) {
  const parsed = AiRefusalSchema.safeParse(refusal);

  return refusedAi(parsed.success ? parsed.data : "unreachable", status);
}

async function answeredDigest(db: Database, task: Readonly<BotTaskRow>): Promise<Verified> {
  const parsed = parsedJson(ModelDigestSchema, task.result ?? "");

  if (parsed === null) {
    await failedAiTask(db, task.id, { reason: "no-json", status: null });

    return refusedAi("no-json");
  }

  const digest = { ...parsed, keptComments: [] };

  await completedAiTask(db, { taskId: task.id, result: digest });

  return { kind: "done", digest, taskId: task.id };
}

async function timedOut(db: Database, taskId: number): Promise<boolean> {
  const [failed] = await failedAiTask(db, taskId, { reason: "timeout", status: null }).returning();

  return failed !== undefined;
}

async function waitStep(
  db: Database,
  context: Readonly<{ taskId: number; endsAt: number; signal: AbortSignal }>,
): Promise<Verified> {
  const { taskId, endsAt, signal } = context;
  const task = await readTask(db, taskId);

  if (task === null) return refusedAi("unreachable");

  const stage = verifyStage(task, { now: signal.aborted ? endsAt : Date.now(), endsAt });

  switch (stage.kind) {
    case "answered":
      return answeredDigest(db, task);
    case "failed":
      return refusalOf(task);
    case "timed-out":
      return (await timedOut(db, taskId)) ? refusedAi("timeout") : waitStep(db, context);
    case "waiting":
      await pause(VERIFY_POLL_MS);

      return waitStep(db, context);
    default: {
      const exhaustive: never = stage;

      return exhaustive;
    }
  }
}

export function awaitVerifiedDigest(
  db: Database,
  { taskId, signal }: Readonly<{ taskId: number; signal: AbortSignal }>,
): Promise<Verified> {
  return waitStep(db, { taskId, signal, endsAt: Date.now() + VERIFY_WAIT_MS });
}
