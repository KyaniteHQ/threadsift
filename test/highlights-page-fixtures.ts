import { HighlightsPageResponseSchema } from "../src/core/contract/highlights-page-wire.ts";
import { NoteResponseSchema } from "../src/core/contract/note-contract.ts";
import type { Instance } from "./instance.ts";
import { keepPassage } from "./lost-highlight-fixtures.ts";
import { atClock } from "./token-budget-fixtures.ts";

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
  Promise.all(passages.map((passage) => keepPassage(instance, itemId, passage)));

export const pageOf = (instance: Instance, query = "") =>
  instance.read("GET", `/api/highlights${query}`, HighlightsPageResponseSchema);

export const entryLines = (page: Awaited<ReturnType<typeof pageOf>>) =>
  page.entries.map(({ kind, id, text }) => `${kind}:${String(id)}:${text}`);

export const countsOf = (counted: readonly { readonly key: string; readonly count: number }[]) =>
  Object.fromEntries(counted.map(({ key, count }) => [key, count]));
