import { z } from "zod";

import { ERROR_TEXT_MAX } from "../../../core/contract/grok-bot-contract.ts";
import {
  type AiTaskRow,
  GROK_BOT_EXECUTOR,
  acceptsAnswer,
  awaitsAnswer,
} from "../../../core/kernel/ai-task-state.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { report } from "../../../core/kernel/failure-log.ts";
import { guardedBatch } from "../../../core/kernel/guards.ts";
import type { JobPorts, JobWrites } from "../../../core/kernel/job-outcome.ts";
import { enqueueQuietly } from "../../../core/kernel/job-rows.ts";
import type { BotResult } from "../../ai/core/bot-task-answering.ts";
import { answeredWrites, reportedWrites } from "../../ai/core/bot-task-rows.ts";
import { botKindOf } from "./bot-task-kinds.ts";

export const BotAnswerSchema = z.union([
  z
    .strictObject({ result: z.unknown() })
    .refine((body) => "result" in body, { error: "result: required" }),
  z.strictObject({ error: z.string().min(1).max(ERROR_TEXT_MAX) }),
]);

export type AnswerOutcome =
  | { readonly kind: "accepted" }
  | { readonly kind: "unsupported" }
  | { readonly kind: "closed" }
  | { readonly kind: "invalid"; readonly reasons: string };

type StoredAnswer =
  | { readonly kind: "result"; readonly body: Readonly<BotResult> }
  | { readonly kind: "error"; readonly text: string };

type Intake = Exclude<AnswerOutcome, { kind: "accepted" }> | { kind: "write"; writes: JobWrites };

const CLOSED: Intake = { kind: "closed" };

function intakeOf(
  db: Database,
  task: Readonly<AiTaskRow>,
  { answer, now }: Readonly<{ answer: StoredAnswer; now: number }>,
): Intake {
  const kind = botKindOf(task);

  if (task.executor !== GROK_BOT_EXECUTOR || kind === null) return { kind: "unsupported" };

  if (!awaitsAnswer(task, now)) return CLOSED;

  if (answer.kind === "error") {
    report("grok-bot-error", { taskId: task.id, jobId: task.jobId ?? 0 });

    return { kind: "write", writes: reportedWrites(db, task, now) };
  }

  const parsed = kind.parse(task.context ?? "", answer.body);

  if (parsed.kind === "invalid") return { kind: "invalid", reasons: parsed.reasons };

  return {
    kind: "write",
    writes: answeredWrites(db, task, { resultText: parsed.normalized, now }),
  };
}

async function committed(
  ports: JobPorts,
  task: Readonly<AiTaskRow>,
  writes: JobWrites,
): Promise<AnswerOutcome> {
  if (!(await guardedBatch(ports.db, acceptsAnswer(task), writes))) {
    return { kind: "closed" };
  }

  if (task.jobId !== null) await enqueueQuietly(ports, [task.jobId], 0);

  return { kind: "accepted" };
}

export function acceptBotAnswer(
  ports: JobPorts,
  task: Readonly<AiTaskRow>,
  answer: StoredAnswer,
): Promise<AnswerOutcome> {
  const now = Date.now();
  const intake = intakeOf(ports.db, task, { answer, now });

  if (intake.kind !== "write") return Promise.resolve(intake);

  return committed(ports, task, intake.writes);
}
