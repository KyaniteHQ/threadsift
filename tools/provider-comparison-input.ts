import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { drizzle } from "drizzle-orm/sqlite-proxy";
import { z } from "zod";

import type { Database } from "../src/core/kernel/database.ts";
import { withCleanup } from "../src/core/kernel/failure-log.ts";
import { digestOutputTokens, submittedOf } from "../src/features/digest/core/digest-prompt.ts";
import { proxyTo } from "../src/targets/node/database.ts";
import { libraryReader } from "./provider-comparison-library.ts";
import { compatibleSource } from "./provider-comparison-source.ts";

const Selector = z.union([z.number().int().positive(), z.url()]);
const SelectedItem = z.object({ id: z.number().int().positive(), generation: z.number().int() });
const StoredTask = z.object({ id: z.number().int().positive(), inputs: z.string() });
const CapturedItem = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("ready"),
      selector: Selector,
      itemId: z.number().int().positive(),
      generation: z.number().int(),
      taskId: z.number().int().positive().nullable(),
      input: z.string(),
      submitted: z.array(z.string()).readonly(),
      maxOutputTokens: z.number().int().positive(),
    })
    .refine(
      (item) => item.maxOutputTokens === digestOutputTokens(item.submitted),
      "Digest output allowance does not match its submitted comments",
    ),
  z.object({
    kind: z.literal("unavailable"),
    selector: Selector,
    itemId: z.number().int().positive().nullable(),
    reason: z.enum([
      "item-not-found",
      "invalid-digest-input",
      "post-text-unreadable",
      "no-digest-content",
      "digest-input-too-large",
    ]),
  }),
]);

export const SnapshotSchema = z.object({
  version: z.literal(2),
  capturedAt: z.iso.datetime(),
  captureRevision: z.string().regex(/^[a-f0-9]{40}$/u),
  instructions: z.string(),
  schemaHash: z.string(),
  items: z.array(CapturedItem).min(1).readonly(),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type ComparisonItem = Snapshot["items"][number];

function fromTask(
  task: Readonly<z.infer<typeof StoredTask>>,
  selector: z.infer<typeof Selector>,
  item: Readonly<z.infer<typeof SelectedItem>>,
): ComparisonItem {
  try {
    const submitted = submittedOf(task.inputs);

    return {
      kind: "ready",
      selector,
      itemId: item.id,
      generation: item.generation,
      taskId: task.id,
      input: task.inputs,
      submitted,
      maxOutputTokens: digestOutputTokens(submitted),
    };
  } catch {
    return { kind: "unavailable", selector, itemId: item.id, reason: "invalid-digest-input" };
  }
}

async function captureItem(
  sqlite: DatabaseSync,
  db: Database,
  reader: Readonly<Awaited<ReturnType<typeof libraryReader>>>,
  selector: z.infer<typeof Selector>,
): Promise<ComparisonItem> {
  const found = SelectedItem.safeParse(
    sqlite
      .prepare(
        "select id, generation from items where id = ? or original_url = ? or normalized_url = ?",
      )
      .get(selector, selector, selector),
  );

  if (!found.success)
    return { kind: "unavailable", selector, itemId: null, reason: "item-not-found" };
  const { id: itemId, generation } = found.data;
  const task = StoredTask.safeParse(
    sqlite
      .prepare(
        "select id, inputs from ai_tasks where item_id = ? and input_revision = ? and kind = 'digest' and executor <> 'caller' order by id desc limit 1",
      )
      .get(itemId, generation),
  );

  if (task.success) return fromTask(task.data, selector, found.data);

  const prompt = await reader.prepare(db, itemId);

  return prompt.kind === "unavailable"
    ? { ...prompt, selector, itemId }
    : {
        kind: "ready",
        selector,
        itemId,
        generation,
        taskId: null,
        input: prompt.input,
        submitted: prompt.submitted,
        maxOutputTokens: prompt.maxOutputTokens,
      };
}

async function readItems(
  sqlite: DatabaseSync,
  reader: Readonly<Awaited<ReturnType<typeof libraryReader>>>,
  selectors: readonly z.infer<typeof Selector>[],
) {
  sqlite.exec("BEGIN");
  const request = proxyTo(sqlite);
  const db = drizzle(request, (queries) =>
    Promise.all(queries.map(({ sql, params, method }) => request(sql, params, method))),
  );
  const items = await Promise.all(
    selectors.map((selector) => captureItem(sqlite, db, reader, selector)),
  );
  const identities = items.map((item) => item.itemId ?? item.selector);

  if (new Set(identities).size !== identities.length) return { error: "Duplicate Items" } as const;

  return items;
}

export async function capture(database: string, list: string) {
  const source = compatibleSource();

  if ("error" in source) return source;
  const selectors = z
    .array(Selector)
    .min(1)
    .parse(JSON.parse(await readFile(list, "utf8")));
  const sqlite = new DatabaseSync(database, { readOnly: true });

  return withCleanup(
    { event: "comparison-database-not-closed", fields: {} },
    async () => {
      const reader = await libraryReader(dirname(database));

      return withCleanup(
        { event: "comparison-reader-not-stopped", fields: {} },
        async () => {
          const items = await readItems(sqlite, reader, selectors);

          if ("error" in items) return items;

          return {
            version: 2,
            capturedAt: new Date().toISOString(),
            captureRevision: source.revision,
            instructions: source.instructions,
            schemaHash: source.schemaHash,
            items,
          } satisfies Snapshot;
        },
        () => {
          reader.stop();
          return Promise.resolve();
        },
      );
    },
    () => {
      sqlite.close();
      return Promise.resolve();
    },
  );
}
