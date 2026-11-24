import assert from "node:assert/strict";

import { z } from "zod";

import type { Instance } from "./instance.ts";
import { rows, until } from "./related-fixtures.ts";

const TaskSchema = z.object({
  id: z.number(),
  inputs: z.string(),
  input_revision: z.number(),
  state: z.string(),
  refusal: z.string().nullable(),
  item_id: z.number(),
});

export function pickTasks(instance: Instance, itemId: number) {
  return rows(
    instance,
    TaskSchema,
    "select id, inputs, input_revision, state, refusal, item_id from ai_tasks where kind = 'related_pick' and item_id = ? order by id",
    itemId,
  );
}

export async function firstPickTask(instance: Instance, itemId: number) {
  const [task] = await until(
    () => pickTasks(instance, itemId),
    (tasks) => tasks.some(({ state }) => state !== "running"),
  );

  assert.ok(task !== undefined);

  return task;
}

const InputSchema = z.object({
  source: z.object({
    id: z.number(),
    title: z.string(),
    topic: z.string(),
    tags: z.array(z.string()),
    summary: z.string(),
  }),
  candidates: z.array(
    z.object({ id: z.number(), title: z.string(), topic: z.string(), summary: z.string() }),
  ),
});

export function sentInput(inputs: string) {
  return InputSchema.parse(JSON.parse(inputs));
}

const JobSchema = z.object({
  id: z.number(),
  kind: z.string(),
  state: z.string(),
  attempts: z.number(),
});

export function pickJobs(instance: Instance, itemId: number) {
  return rows(
    instance,
    JobSchema,
    "select id, kind, state, attempts from jobs where kind = 'related_pick' and item_id = ? order by id",
    itemId,
  );
}
