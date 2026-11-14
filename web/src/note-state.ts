import {
  NOTE_MAX_CODE_POINTS,
  type NoteView,
  storedNoteBody,
} from "../../src/core/note-contract.ts";
import type { NoteSaveResult } from "./api.ts";
import type { NoteDraft, NoteSent } from "./note-draft.ts";

export interface NoteState {
  readonly saved: NoteView;
  readonly draft: string;
  readonly newer: NoteView | null;
  readonly outcome: "idle" | "saved" | "failed";
  readonly sent: NoteSent | null;
  readonly adopted: boolean;
}

export type NoteAction =
  | { readonly kind: "type"; readonly text: string }
  | { readonly kind: "send"; readonly sent: Readonly<NoteSent> }
  | { readonly kind: "answer"; readonly answer: NoteSaveResult | null }
  | { readonly kind: "take-newer" }
  | { readonly kind: "adopt"; readonly kept: Readonly<NoteDraft> };

function ownSaveCommitted(saved: Readonly<NoteView>, { sent }: Readonly<NoteDraft>): boolean {
  return (
    sent !== null &&
    saved.revision === sent.revision + 1 &&
    saved.body === storedNoteBody(sent.body)
  );
}

export function noteStart(saved: Readonly<NoteView>, kept: Readonly<NoteDraft> | null): NoteState {
  const idle = { newer: null, outcome: "idle", sent: null, adopted: false } as const;

  if (kept === null || storedNoteBody(kept.body) === saved.body) {
    return { ...idle, saved, draft: saved.body ?? "" };
  }

  const revision = ownSaveCommitted(saved, kept) ? saved.revision : kept.revision;

  return { ...idle, saved: { body: saved.body, revision }, draft: kept.body };
}

export function noteFlags({ saved, draft, newer, sent }: Readonly<NoteState>) {
  const dirty = storedNoteBody(draft) !== saved.body;
  const tooLong = Array.from(draft).length > NOTE_MAX_CODE_POINTS;
  const pending = sent !== null;

  return { dirty, tooLong, pending, canSave: dirty && !tooLong && !pending && newer === null };
}

function answered(state: Readonly<NoteState>, answer: Readonly<NoteSaveResult> | null): NoteState {
  const idle = { ...state, sent: null, adopted: false };

  if (answer === null) return { ...idle, outcome: "failed" };

  if (answer.outcome === "newer") return { ...idle, newer: answer.note };

  return {
    ...idle,
    saved: answer.note,
    newer: null,
    outcome: "saved",
    draft: state.draft === state.sent?.body ? (answer.note.body ?? "") : state.draft,
  };
}

export function noteReducer(state: Readonly<NoteState>, action: Readonly<NoteAction>): NoteState {
  switch (action.kind) {
    case "type":
      return {
        ...state,
        draft: action.text,
        adopted: false,
        outcome: state.outcome === "saved" ? "idle" : state.outcome,
      };
    case "send":
      return { ...state, sent: action.sent, adopted: false, outcome: "idle" };
    case "answer":
      return answered(state, action.answer);
    case "take-newer":
      return state.newer === null || state.sent !== null
        ? state
        : {
            ...state,
            saved: state.newer,
            draft: state.newer.body ?? "",
            newer: null,
            adopted: false,
            outcome: "idle",
          };

    case "adopt": {
      if (action.kept.revision < state.saved.revision) return state;

      const { saved, draft } = noteStart(state.saved, action.kept);

      return { ...state, saved, draft, adopted: true };
    }

    default: {
      const exhaustive: never = action;

      return exhaustive;
    }
  }
}
