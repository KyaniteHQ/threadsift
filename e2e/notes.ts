import { type APIRequestContext, type APIResponse, expect } from "@playwright/test";
import { z } from "zod";

import { itemOf } from "./api.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { putPost } from "./highlights.ts";
import { run } from "./thread-fixtures.ts";

export const NOTE_LIMIT = 10_000;

const NoteSchema = z.object({ body: z.string().nullable(), revision: z.number() });

const Saved = z.object({ note: NoteSchema });

const Conflict = z.object({ error: z.string(), note: NoteSchema });

export type NoteState = z.infer<typeof NoteSchema>;

export async function putNote(
  request: APIRequestContext,
  itemId: number,
  fields: Readonly<{ body?: unknown; revision?: unknown }>,
  headers: Readonly<Record<string, string>> = {},
) {
  const response = await request.put(`/api/items/${itemId}/note`, { data: fields, headers });

  return { status: response.status(), response };
}

export async function noteIn(response: APIResponse): Promise<NoteState> {
  return Saved.parse(await response.json()).note;
}

export async function conflictIn(response: APIResponse): Promise<NoteState> {
  return Conflict.parse(await response.json()).note;
}

export async function saved(
  request: APIRequestContext,
  itemId: number,
  body: string,
  revision: number,
): Promise<NoteState> {
  const { status, response } = await putNote(request, itemId, { body, revision });
  expect(status, await response.text()).toBe(200);

  return noteIn(response);
}

export async function noteOf(request: APIRequestContext, itemId: number): Promise<NoteState> {
  return (await itemOf(request, itemId)).note;
}

const Rows = z.array(
  z.object({
    body: z.string().nullable(),
    revision: z.number(),
    createdAt: z.number(),
    updatedAt: z.number(),
  }),
);

export function noteRows(screen: FreshScreen, itemId: number) {
  return screen.fresh.query(
    `SELECT body, revision, created_at AS createdAt, updated_at AS updatedAt FROM notes WHERE item_id = ${itemId}`,
    Rows,
  );
}

const Parts = z.array(z.object({ id: z.number(), kind: z.string(), body: z.string() }));

function partsOf(screen: FreshScreen, itemId: number) {
  return screen.fresh.query(
    `SELECT id, kind, body FROM search_parts WHERE item_id = ${itemId} ORDER BY id`,
    Parts,
  );
}

export function noteParts(screen: FreshScreen, itemId: number): string[] {
  return partsOf(screen, itemId)
    .filter(({ kind }) => kind === "note")
    .map(({ body }) => body);
}

export function partsBesidesNote(screen: FreshScreen, itemId: number) {
  return partsOf(screen, itemId)
    .filter(({ kind }) => kind !== "note")
    .map(({ id, kind }) => ({ id, kind }));
}

export async function expectConsistent(
  screen: FreshScreen,
  itemId: number,
  expected: Readonly<NoteState>,
): Promise<void> {
  expect(await noteOf(screen.context.request, itemId), "the detail").toEqual(expected);
  expect(
    noteRows(screen, itemId).map(({ body, revision }) => ({ body, revision })),
    "the notes row",
  ).toEqual([expected]);
  expect(noteParts(screen, itemId), "the search part").toEqual(
    expected.body === null ? [] : [expected.body],
  );
}

export function newNoteItem(screen: FreshScreen, tag: string): Promise<number> {
  return putPost(screen.context.request, `${tag}${run}`, `Post text of ${tag}.`);
}
