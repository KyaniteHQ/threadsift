import { z } from "zod";

import { DigestSchema } from "../src/core/contract/digest-schema.ts";
import type { WebhookBody } from "../src/core/contract/grok-bot-contract.ts";
import { ItemPageResponseSchema } from "../src/core/contract/item-route-wire.ts";
import { SaveItemRequestSchema } from "../src/core/contract/save-wire.ts";
import { TopicIndexSchema } from "../src/core/contract/topic-index-contract.ts";
import { IntakeAnswerSchema } from "../src/core/contract/x-intake-contract.ts";
import { XThreadSchema } from "../src/core/contract/x-wire.ts";
import { TaskReadSchema } from "../src/features/bot/core/ai-task-read.ts";
import { readOf } from "./ai-task-read-http.ts";

export async function readTask(
  instance: Parameters<typeof readOf>[0],
  task: Readonly<{ id: number; token: string }>,
) {
  return TaskReadSchema.parse(await (await readOf(instance, task.id, task.token)).json());
}

export const JsonSchema = z.json();

export type JsonValue = z.infer<typeof JsonSchema>;

function propertyNames(node: JsonValue, found: Set<string> = new Set()): Set<string> {
  const list = z.array(JsonSchema).safeParse(node);

  if (list.success) {
    for (const child of list.data) propertyNames(child, found);

    return found;
  }

  const record = z.record(z.string(), JsonSchema).safeParse(node);

  if (!record.success) return found;

  for (const [key, child] of Object.entries(record.data)) {
    if (key === "properties") {
      for (const name of Object.keys(z.record(z.string(), JsonSchema).parse(child)))
        found.add(name);
    }

    propertyNames(child, found);
  }

  return found;
}

function fieldsOf(schema: z.ZodType): string[] {
  return Array.from(
    propertyNames(z.json().parse(z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }))),
  );
}

const WEBHOOK_BODY = {
  taskId: true,
  kind: true,
  callbackToken: true,
} satisfies Record<keyof WebhookBody, true>;

export const WEBHOOK_FIELDS: readonly string[] = Object.keys(WEBHOOK_BODY);

export function schemaFields(intakeInput: string): readonly string[] {
  return [
    ...[
      DigestSchema,
      XThreadSchema,
      IntakeAnswerSchema,
      TaskReadSchema,
      SaveItemRequestSchema,
      ItemPageResponseSchema,
      TopicIndexSchema,
    ].flatMap((schema) => fieldsOf(schema)),
    ...Object.keys(z.record(z.string(), z.unknown()).parse(JSON.parse(intakeInput))),
    ...WEBHOOK_FIELDS,
  ];
}
