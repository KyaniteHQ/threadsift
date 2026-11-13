import { z } from "zod";

import type { BotTaskKind } from "./bot-task-kind.ts";
import {
  type BotTaskRow,
  GROK_BOT_EXECUTOR,
  acceptsAnswer,
  answeredWrites,
  reportedWrites,
  stateOf,
} from "./bot-task-states.ts";
import { report } from "./failure-log.ts";
import { guardedBatch } from "./guards.ts";
import type { JobPorts, JobWrites } from "./job-outcome.ts";
import { enqueueQuietly } from "./job-rows.ts";
import { relatedBotKind } from "./related-bot.ts";

const ERROR_TEXT_MAX = 200;

export const BotAnswerSchema = z.union([
  z
    .strictObject({ result: z.unknown() })
    .refine((body) => "result" in body, { error: "result: required" }),
  z.strictObject({ error: z.string().min(1).max(ERROR_TEXT_MAX) }),
]);

export const BOT_TASK_KINDS = {
  related_pick: relatedBotKind,
} as const satisfies Readonly<Record<string, BotTaskKind>>;

type BotTaskKindName = keyof typeof BOT_TASK_KINDS;

function isBotTaskKind(kind: string): kind is BotTaskKindName {
  return Object.hasOwn(BOT_TASK_KINDS, kind);
}

function botTaskKindOf(kind: string): BotTaskKind | null {
  return isBotTaskKind(kind) ? BOT_TASK_KINDS[kind] : null;
}

export type AnswerOutcome =
  | { readonly kind: "accepted" }
  | { readonly kind: "unsupported" }
  | { readonly kind: "closed" }
  | { readonly kind: "invalid"; readonly reasons: string };

export type StoredAnswer =
  | { readonly kind: "result"; readonly resultText: string }
  | { readonly kind: "error"; readonly text: string };

type Intake = Exclude<AnswerOutcome, { kind: "accepted" }> | { kind: "write"; writes: JobWrites };

const CLOSED: Intake = { kind: "closed" };

function intakeOf(
  db: JobPorts["db"],
  task: Readonly<BotTaskRow>,
  { answer, now }: Readonly<{ answer: StoredAnswer; now: number }>,
): Intake {
  const kind = botTaskKindOf(task.kind);

  if (task.executor !== GROK_BOT_EXECUTOR || kind === null) return { kind: "unsupported" };

  const state = stateOf(task);

  if ((state !== "unsent" && state !== "sent") || task.deadline <= now) return CLOSED;

  if (answer.kind === "error") {
    report("grok-bot-error", { taskId: task.id, jobId: task.jobId ?? 0, text: answer.text });

    return { kind: "write", writes: reportedWrites(db, task, now) };
  }

  const { resultText } = answer;
  const parsed = kind.parse(task.context ?? "", resultText);

  if (parsed.kind === "invalid") return { kind: "invalid", reasons: parsed.reasons };

  return { kind: "write", writes: answeredWrites(db, task, { resultText, now }) };
}

async function committed(
  ports: JobPorts,
  task: Readonly<BotTaskRow>,
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
  task: Readonly<BotTaskRow>,
  answer: StoredAnswer,
): Promise<AnswerOutcome> {
  const now = Date.now();
  const intake = intakeOf(ports.db, task, { answer, now });

  if (intake.kind !== "write") return Promise.resolve(intake);

  return committed(ports, task, intake.writes);
}
