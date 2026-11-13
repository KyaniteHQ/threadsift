import { z } from "zod";

import { DigestSchema } from "../src/core/ai-contract.ts";
import { TaskReadSchema, WebhookBodySchema } from "../src/core/ai-task-read.ts";
import { TopicIndexSchema } from "../src/core/topic-index-contract.ts";
import { IntakeAnswerSchema, IntakeInputSchema } from "../src/core/x-intake-contract.ts";
import { XThreadSchema } from "../src/core/x-wire.ts";
import { SaveItemRequestSchema } from "../src/http/save-schemas.ts";
import { ItemPageResponseSchema } from "../src/http/schemas.ts";

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

export function schemaFields(): readonly string[] {
  return [
    DigestSchema,
    XThreadSchema,
    IntakeAnswerSchema,
    IntakeInputSchema,
    TaskReadSchema,
    WebhookBodySchema,
    SaveItemRequestSchema,
    ItemPageResponseSchema,
    TopicIndexSchema,
  ].flatMap((schema) => fieldsOf(schema));
}
