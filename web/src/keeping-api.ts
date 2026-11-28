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
import { RESTORING, type Restoring, callUnlessRestoring, isRestoring } from "./unavailable.ts";
import { DATABASE_WRITE_DEADLINE_MS } from "./write-deadlines.ts";

type KeepResult =
  | { readonly kind: "kept"; readonly highlight: Highlight }
  | { readonly kind: "changed" }
  | { readonly kind: "refused" }
  | Restoring;

export async function keepHighlight(
  id: number,
  request: Readonly<CreateHighlightRequest>,
): Promise<KeepResult> {
  const response = await callUnlessRestoring(
    post(DATABASE_WRITE_DEADLINE_MS),
    `/api/items/${id}/highlights`,
    { json: request, tolerates: [400, 404, 409] },
  );

  if (isRestoring(response)) return RESTORING;

  if (response.status === 400) {
    if (SelectorMismatchSchema.safeParse(await response.json().catch(() => null)).success)
      return { kind: "refused" };
    throw new Error(`POST /api/items/${id}/highlights answered 400`);
  }
  if (response.status === 404 || response.status === 409) return { kind: "changed" };

  return {
    kind: "kept",
    highlight: (await parsedBody(response, HighlightResponseSchema)).highlight,
  };
}

export async function dropHighlight(id: number, highlightId: number): Promise<void> {
  await callOk(del(DATABASE_WRITE_DEADLINE_MS), `/api/items/${id}/highlights/${highlightId}`, {
    tolerates: [404],
  });
}

export type NoteSaveResult =
  | { readonly kind: "saved"; readonly note: NoteView }
  | { readonly kind: "newer"; readonly note: NoteView }
  | Restoring;

export async function putNote(
  id: number,
  request: Readonly<SaveNoteRequest>,
): Promise<NoteSaveResult> {
  const response = await callUnlessRestoring(
    put(DATABASE_WRITE_DEADLINE_MS),
    `/api/items/${id}/note`,
    { json: request, tolerates: [409] },
  );

  if (isRestoring(response)) return RESTORING;

  return response.status === 409
    ? { kind: "newer", note: (await parsedBody(response, NoteConflictSchema)).note }
    : { kind: "saved", note: (await parsedBody(response, NoteResponseSchema)).note };
}
