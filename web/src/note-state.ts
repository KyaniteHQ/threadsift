import {
  NOTE_MAX_CODE_POINTS,
  type NoteView,
  storedNoteBody,
} from "../../src/core/note-contract.ts";
import type { NoteSaveResult } from "./keeping-api.ts";
import type { NoteDraft } from "./note-draft.ts";

type NoteAttempt = "idle" | "saving" | "failed" | "saved";

export interface NoteState {
  readonly saved: NoteView;
  readonly draft: string;
  readonly newer: NoteView | null;
  readonly attempt: NoteAttempt;
}

export type NoteAction =
  | { readonly kind: "type"; readonly text: string }
  | { readonly kind: "send" }
  | { readonly kind: "answer"; readonly answer: NoteSaveResult | null; readonly body: string }
  | { readonly kind: "take-newer" };

export function noteStart(saved: Readonly<NoteView>, kept: Readonly<NoteDraft> | null): NoteState {
  const keptDraft = kept === null || storedNoteBody(kept.body) === saved.body ? null : kept;

  return {
    saved: { body: saved.body, revision: keptDraft?.revision ?? saved.revision },
    draft: keptDraft?.body ?? saved.body ?? "",
    newer: null,
    attempt: "idle",
  };
}

export function noteFlags({ saved, draft, newer, attempt }: Readonly<NoteState>) {
  const dirty = storedNoteBody(draft) !== saved.body;
  const tooLong = Array.from(draft).length > NOTE_MAX_CODE_POINTS;
  const pending = attempt === "saving";

  return { dirty, tooLong, pending, canSave: dirty && !tooLong && !pending && newer === null };
}

function answered(
  state: Readonly<NoteState>,
  { answer, body }: Readonly<Extract<NoteAction, { kind: "answer" }>>,
): NoteState {
  if (answer === null) return { ...state, attempt: "failed" };

  if (answer.outcome === "newer") return { ...state, attempt: "idle", newer: answer.note };

  return {
    ...state,
    attempt: "saved",
    saved: answer.note,
    newer: null,
    draft: state.draft === body ? (answer.note.body ?? "") : state.draft,
  };
}

export function noteReducer(state: Readonly<NoteState>, action: Readonly<NoteAction>): NoteState {
  switch (action.kind) {
    case "type":
      return {
        ...state,
        draft: action.text,
        attempt: state.attempt === "saved" ? "idle" : state.attempt,
      };
    case "send":
      return {
        ...state,
        attempt: "saving",
      };
    case "answer":
      return answered(state, action);
    case "take-newer":
      return state.newer === null || state.attempt === "saving"
        ? state
        : {
            ...state,
            saved: state.newer,
            draft: state.newer.body ?? "",
            newer: null,
            attempt: "idle",
          };

    default: {
      const exhaustive: never = action;

      return exhaustive;
    }
  }
}
