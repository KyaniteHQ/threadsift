import { z } from "zod";

import { type AiTaskRow, acceptsAnswer } from "./ai-task-state.ts";
import { botKindOf } from "./bot-task-kinds.ts";
import type { Database } from "./database.ts";
import { guardHolds } from "./guards.ts";

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

function describedTask(task: Readonly<Pick<AiTaskRow, "kind" | "context">>) {
  return botKindOf(task)?.describe(task.context ?? "") ?? null;
}

export async function readableTask(db: Database, task: Readonly<AiTaskRow>): Promise<TaskReading> {
  const described = describedTask(task);

  if (described === null) return { kind: "unsupported" };

  if (!(await guardHolds(db, acceptsAnswer(task)))) return { kind: "closed" };

  return {
    kind: "open",
    task: { taskId: task.id, kind: task.kind, input: task.inputs, ...described },
  };
}
