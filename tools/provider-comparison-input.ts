import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { z } from "zod";

import { BASE_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS } from "../src/core/ai-contract.ts";
import { TASKS } from "../src/core/ai-tasks.ts";
import { utf8Length } from "../src/core/encoding.ts";

export class ComparisonError extends Error {}

const Selector = z.union([z.number().int().positive(), z.url()]);
const SelectedItem = z.object({ id: z.number().int().positive(), generation: z.number().int() });
const StoredTask = z.object({ id: z.number().int().positive(), inputs: z.string() });
const Envelope = z.object({ comments: z.array(z.object({ id: z.string() })) });

const CapturedItem = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ready"),
    selector: Selector,
    itemId: z.number().int().positive(),
    generation: z.number().int(),
    taskId: z.number().int().positive(),
    input: z.string(),
    submitted: z.array(z.string()).readonly(),
    maxOutputTokens: z.number().int().positive().max(MAX_OUTPUT_TOKENS),
  }),
  z.object({
    kind: z.literal("unavailable"),
    selector: Selector,
    reason: z.enum(["item-not-found", "no-current-model-digest-input", "invalid-digest-input"]),
  }),
]);

export const SnapshotSchema = z.object({
  version: z.literal(1),
  capturedAt: z.iso.datetime(),
  instructions: z.string(),
  schemaHash: z.string(),
  items: z.array(CapturedItem).min(1).readonly(),
});

export type Snapshot = z.infer<typeof SnapshotSchema>;
export type ComparisonItem = Snapshot["items"][number];

export function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function schemaHash(): string {
  return hash(JSON.stringify(z.toJSONSchema(TASKS.digest.schema)));
}

export async function outsideRepository(folder: string): Promise<string> {
  const canonical = await realpath(folder);
  let parent = canonical;

  for (;;) {
    if (existsSync(join(parent, ".git")))
      throw new ComparisonError("Output must be outside every git checkout");
    const next = dirname(parent);

    if (next === parent) return canonical;
    parent = next;
  }
}

function captureItem(sqlite: DatabaseSync, selector: z.infer<typeof Selector>): ComparisonItem {
  const found = SelectedItem.safeParse(
    sqlite
      .prepare(
        "select id, generation from items where id = ? or original_url = ? or normalized_url = ?",
      )
      .get(selector, selector, selector),
  );

  if (!found.success) return { kind: "unavailable", selector, reason: "item-not-found" };
  const { id: itemId, generation } = found.data;
  const task = StoredTask.safeParse(
    sqlite
      .prepare(
        "select id, inputs from ai_tasks where item_id = ? and input_revision = ? and kind = 'digest' and executor in ('cli', 'http', 'binding', 'grok-bot') order by id desc limit 1",
      )
      .get(itemId, generation),
  );

  if (!task.success)
    return { kind: "unavailable", selector, reason: "no-current-model-digest-input" };

  try {
    const envelope = Envelope.parse(
      JSON.parse(task.data.inputs.slice(task.data.inputs.indexOf("\n") + 1)),
    );
    const submitted = envelope.comments.map(({ id }) => id);

    return {
      kind: "ready",
      selector,
      itemId,
      generation,
      taskId: task.data.id,
      input: task.data.inputs,
      submitted,
      maxOutputTokens: Math.min(
        MAX_OUTPUT_TOKENS,
        BASE_OUTPUT_TOKENS + utf8Length(JSON.stringify(submitted)),
      ),
    };
  } catch {
    return { kind: "unavailable", selector, reason: "invalid-digest-input" };
  }
}

export async function capture(database: string, list: string): Promise<Snapshot> {
  const selectors = z
    .array(Selector)
    .min(1)
    .parse(JSON.parse(await readFile(list, "utf8")));

  if (new Set(selectors).size !== selectors.length)
    throw new ComparisonError("Duplicate Item selectors");
  const sqlite = new DatabaseSync(database, { readOnly: true });

  try {
    sqlite.exec("BEGIN");

    return {
      version: 1,
      capturedAt: new Date().toISOString(),
      instructions: TASKS.digest.instructions,
      schemaHash: schemaHash(),
      items: selectors.map((selector) => captureItem(sqlite, selector)),
    };
  } finally {
    sqlite.close();
  }
}
