import {
  type CreateHighlightRequest,
  type Highlight,
  HighlightResponseSchema,
  SelectorMismatchSchema,
} from "../../src/core/contract/highlight-contract.ts";
import {
  type NoteView,
  NoteConflictSchema,
  NoteResponseSchema,
  type SaveNoteRequest,
} from "../../src/core/contract/note-contract.ts";
import { callOk, del, parsedBody, post, put } from "./calls.ts";
import { DATABASE_WRITE_DEADLINE_MS } from "./write-deadlines.ts";

type KeepResult =
  | { readonly outcome: "kept"; readonly highlight: Highlight }
  | { readonly outcome: "changed" }
  | { readonly outcome: "refused" };

export async function keepHighlight(
  id: number,
  request: Readonly<CreateHighlightRequest>,
): Promise<KeepResult> {
  const response = await callOk(post(DATABASE_WRITE_DEADLINE_MS), `/api/items/${id}/highlights`, {
    json: request,
    tolerates: [400, 404, 409],
  });

  if (response.status === 400) {
    if (SelectorMismatchSchema.safeParse(await response.json().catch(() => null)).success)
      return { outcome: "refused" };
    throw new Error(`POST /api/items/${id}/highlights answered 400`);
  }
  if (response.status === 404 || response.status === 409) return { outcome: "changed" };

  return {
    outcome: "kept",
    highlight: (await parsedBody(response, HighlightResponseSchema)).highlight,
  };
}

export async function dropHighlight(id: number, highlightId: number): Promise<void> {
  await callOk(del(DATABASE_WRITE_DEADLINE_MS), `/api/items/${id}/highlights/${highlightId}`, {
    tolerates: [404],
  });
}

export type NoteSaveResult =
  | { readonly outcome: "saved"; readonly note: NoteView }
  | { readonly outcome: "newer"; readonly note: NoteView };

export async function putNote(
  id: number,
  request: Readonly<SaveNoteRequest>,
): Promise<NoteSaveResult> {
  const response = await callOk(put(DATABASE_WRITE_DEADLINE_MS), `/api/items/${id}/note`, {
    json: request,
    tolerates: [409],
  });

  return response.status === 409
    ? { outcome: "newer", note: (await parsedBody(response, NoteConflictSchema)).note }
    : { outcome: "saved", note: (await parsedBody(response, NoteResponseSchema)).note };
}
