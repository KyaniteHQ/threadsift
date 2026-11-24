import assert from "node:assert/strict";

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

export async function keepEach(instance: Instance, itemId: number, passages: readonly string[]) {
  const { postText, highlights } = await instance.detail(itemId);
  const text = postText ?? "";

  await Promise.all(
    passages.map(async (exact) => {
      const start = text.indexOf(exact);
      const answer = await instance.send("POST", `/api/items/${String(itemId)}/highlights`, {
        target: { kind: "post" },
        revision: highlights.revisions.post,
        selector: {
          exact,
          prefix: text.slice(Math.max(0, start - 32), start),
          suffix: text.slice(start + exact.length, start + exact.length + 32),
          hint: start,
        },
      });

      assert.equal(answer.status, 201);
    }),
  );
}

export const pageOf = (instance: Instance, query = "") =>
  instance.read("GET", `/api/highlights${query}`, HighlightsPageResponseSchema);

export const summary = (page: Awaited<ReturnType<typeof pageOf>>) =>
  page.entries.map(({ kind, id, text }) => `${kind}:${String(id)}:${text}`);

export const countsOf = (counted: readonly { readonly key: string; readonly count: number }[]) =>
  Object.fromEntries(counted.map(({ key, count }) => [key, count]));
