import { count as countAll, is } from "drizzle-orm";
import { SQLiteSelectBase } from "drizzle-orm/sqlite-core";

import {
  HighlightsListResponseSchema,
  HighlightsReadResponseSchema,
} from "../src/core/contract/highlights-page-wire.ts";
import { NoteResponseSchema } from "../src/core/contract/note-contract.ts";
import type { Database } from "../src/core/kernel/database.ts";
import { highlights } from "../src/core/kernel/schema.ts";
import { atClock } from "./clock-fixtures.ts";
import type { Instance } from "./instance.ts";
import { inOrder } from "./library-fixtures.ts";
import { keepPassage } from "./lost-highlight-fixtures.ts";

export const keepNote = (
  instance: Instance,
  instant: number,
  { itemId, body, revision }: Readonly<{ itemId: number; body: string; revision: number }>,
) =>
  atClock(
    () => instant,
    () =>
      instance.read("PUT", `/api/items/${String(itemId)}/note`, NoteResponseSchema, {
        body,
        revision,
      }),
  );

export const keepAt = (instance: Instance, instant: number, itemId: number, passage: string) =>
  atClock(
    () => instant,
    () => keepPassage(instance, itemId, passage),
  );

export const keepEach = (instance: Instance, itemId: number, passages: readonly string[]) =>
  inOrder(passages, async (passage) => {
    await keepPassage(instance, itemId, passage);
  });

export const pageOf = (instance: Instance, query = "") =>
  instance.read("GET", `/api/highlights${query}`, HighlightsListResponseSchema);

export const pageAfter = (instance: Instance, cursor: string) =>
  instance.read("GET", `/api/highlights?cursor=${cursor}`, HighlightsReadResponseSchema);

export const entryLines = (page: Awaited<ReturnType<typeof pageOf>>) =>
  page.entries.map(({ kind, id, text }) => `${kind}:${String(id)}:${text}`);

export const countsOf = (counted: readonly { readonly key: string; readonly count: number }[]) =>
  Object.fromEntries(counted.map(({ key, count }) => [key, count]));

export async function countingBatches<Result>(
  instance: Instance,
  run: () => Promise<Result>,
): Promise<{ readonly answer: Result; readonly batches: number }> {
  const { db } = instance.core;
  const real = db.batch.bind(db);
  const highlightTotal = db.select({ count: countAll() }).from(highlights).toSQL().sql;
  let batches = 0;

  Object.defineProperty(db, "batch", {
    configurable: true,
    value: (queries: Parameters<Database["batch"]>[0]) => {
      if (
        queries.some((query) => is(query, SQLiteSelectBase) && query.toSQL().sql === highlightTotal)
      ) {
        batches += 1;
      }

      return real(queries);
    },
  });

  try {
    return { answer: await run(), batches };
  } finally {
    Reflect.deleteProperty(db, "batch");
  }
}
