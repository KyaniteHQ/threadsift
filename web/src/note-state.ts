import { NOTE_MAX_CODE_POINTS, type NoteView } from "../../src/core/note-contract.ts";
import type { NoteSaveResult } from "./api.ts";

export interface NoteState {
  readonly saved: NoteView;
  readonly draft: string;
  readonly newer: NoteView | null;
  readonly outcome: "idle" | "saved" | "failed";
  readonly pending: boolean;
}

export type NoteAction =
  | { readonly kind: "type"; readonly text: string }
  | { readonly kind: "send" }
  | {
      readonly kind: "answer";
      readonly sent: string;
      readonly answer: NoteSaveResult | null;
    }
  | { readonly kind: "take-newer" };

export function noteStart(saved: Readonly<NoteView>): NoteState {
  return { saved, draft: saved.body ?? "", newer: null, outcome: "idle", pending: false };
}

function stored(draft: string): string | null {
  return draft.trim() === "" ? null : draft;
}

export function noteFlags({ saved, draft, newer, pending }: Readonly<NoteState>) {
  const dirty = stored(draft) !== saved.body;
  const tooLong = Array.from(draft).length > NOTE_MAX_CODE_POINTS;

  return { dirty, tooLong, canSave: dirty && !tooLong && !pending && newer === null };
}

function answered(
  state: Readonly<NoteState>,
  sent: string,
  answer: Readonly<NoteSaveResult> | null,
): NoteState {
  const idle = { ...state, pending: false };

  if (answer === null) return { ...idle, outcome: "failed" };

  if (answer.outcome === "newer") return { ...idle, newer: answer.note };

  return {
    ...idle,
    saved: answer.note,
    newer: null,
    outcome: "saved",
    draft: state.draft === sent ? (answer.note.body ?? "") : state.draft,
  };
}

export function noteReducer(state: Readonly<NoteState>, action: Readonly<NoteAction>): NoteState {
  switch (action.kind) {
    case "type":
      return {
        ...state,
        draft: action.text,
        outcome: state.outcome === "saved" ? "idle" : state.outcome,
      };
    case "send":
      return { ...state, pending: true, outcome: "idle" };
    case "answer":
      return answered(state, action.sent, action.answer);
    case "take-newer":
      return state.newer === null
        ? state
        : {
            ...state,
            saved: state.newer,
            draft: state.newer.body ?? "",
            newer: null,
            outcome: "idle",
          };
    default: {
      const exhaustive: never = action;

      return exhaustive;
    }
  }
}
