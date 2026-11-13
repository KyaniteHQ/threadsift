import { z } from "zod";

import { botKindOf } from "./bot-task-kinds.ts";
import { type BotTaskRow, acceptsAnswer } from "./bot-task-states.ts";
import { guardHolds } from "./guards.ts";
import type { Database } from "./ports.ts";
import { X_INTAKE_TASK } from "./x-intake-contract.ts";
import { xIntakeKind } from "./x-intake.ts";

export const WebhookBodySchema = z.strictObject({
  taskId: z.number().int().positive(),
  kind: z.string(),
  callbackToken: z.string(),
});

export type WebhookBody = z.output<typeof WebhookBodySchema>;

export const TaskReadSchema = z.strictObject({
  taskId: z.number().int().positive(),
  kind: z.string(),
  instructions: z.string(),
  input: z.string(),
  schema: z.record(z.string(), z.unknown()),
});

type TaskRead = z.output<typeof TaskReadSchema>;

type TaskReading =
  | { readonly kind: "open"; readonly task: TaskRead }
  | { readonly kind: "unsupported" }
  | { readonly kind: "closed" };

function describedTask(task: Readonly<Pick<BotTaskRow, "kind" | "context">>) {
  const kind = task.kind === X_INTAKE_TASK ? xIntakeKind : botKindOf(task);

  return kind?.describe(task.context ?? "") ?? null;
}

export async function readableTask(db: Database, task: Readonly<BotTaskRow>): Promise<TaskReading> {
  const described = describedTask(task);

  if (described === null) return { kind: "unsupported" };

  if (!(await guardHolds(db, acceptsAnswer(task)))) return { kind: "closed" };

  return {
    kind: "open",
    task: { taskId: task.id, kind: task.kind, input: task.inputs, ...described },
  };
}
