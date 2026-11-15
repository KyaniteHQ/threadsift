import {
  NOTE_MAX_CODE_POINTS,
  type NoteView,
  storedNoteBody,
} from "../../src/core/note-contract.ts";
import type { NoteSaveResult } from "./keeping-api.ts";
import type { NoteDraft, NoteSent } from "./note-draft.ts";

export type NoteAttempt =
  | { readonly kind: "none" }
  | { readonly kind: "in-flight"; readonly sent: Readonly<NoteSent> }
  | { readonly kind: "unanswered"; readonly sent: Readonly<NoteSent> };

const NO_ATTEMPT: NoteAttempt = { kind: "none" };

export function sentOf(attempt: Readonly<NoteAttempt>): NoteSent | null {
  return attempt.kind === "none" ? null : attempt.sent;
}

export interface NoteState {
  readonly saved: NoteView;
  readonly draft: string;
  readonly newer: NoteView | null;
  readonly outcome: "idle" | "saved" | "failed";
  readonly attempt: NoteAttempt;
  readonly adopted: boolean;
}

export type NoteAction =
  | { readonly kind: "type"; readonly text: string }
  | { readonly kind: "send"; readonly sent: Readonly<NoteSent> }
  | { readonly kind: "answer"; readonly answer: NoteSaveResult | null }
  | { readonly kind: "take-newer" }
  | { readonly kind: "adopt"; readonly kept: Readonly<NoteDraft> };

function ownSaveCommitted(saved: Readonly<NoteView>, attempt: Readonly<NoteAttempt>): boolean {
  const sent = sentOf(attempt);

  return (
    sent !== null &&
    saved.revision === sent.revision + 1 &&
    saved.body === storedNoteBody(sent.body)
  );
}

export function noteStart(saved: Readonly<NoteView>, kept: Readonly<NoteDraft> | null): NoteState {
  const idle = { newer: null, outcome: "idle", adopted: false } as const;

  if (kept === null || storedNoteBody(kept.body) === saved.body) {
    return { ...idle, saved, draft: saved.body ?? "", attempt: NO_ATTEMPT };
  }

  const reloaded: NoteAttempt =
    kept.sent === null ? NO_ATTEMPT : { kind: "unanswered", sent: kept.sent };

  const committed = ownSaveCommitted(saved, reloaded);
  const revision = committed ? saved.revision : kept.revision;

  return {
    ...idle,
    saved: { body: saved.body, revision },
    draft: kept.body,
    attempt: committed ? NO_ATTEMPT : reloaded,
  };
}

export function noteFlags({ saved, draft, newer, attempt }: Readonly<NoteState>) {
  const dirty = storedNoteBody(draft) !== saved.body;
  const tooLong = Array.from(draft).length > NOTE_MAX_CODE_POINTS;
  const pending = attempt.kind === "in-flight";

  return { dirty, tooLong, pending, canSave: dirty && !tooLong && !pending && newer === null };
}

function answered(state: Readonly<NoteState>, answer: Readonly<NoteSaveResult> | null): NoteState {
  const idle = { ...state, adopted: false };

  if (answer === null) {
    const { attempt } = state;

    return {
      ...idle,
      attempt: attempt.kind === "none" ? attempt : { kind: "unanswered", sent: attempt.sent },
      outcome: "failed",
    };
  }

  const resolved = { ...idle, attempt: NO_ATTEMPT };

  if (answer.outcome === "newer" && !ownSaveCommitted(answer.note, state.attempt)) {
    return { ...resolved, newer: answer.note };
  }

  return {
    ...resolved,
    saved: answer.note,
    newer: null,
    outcome: "saved",
    draft: state.draft === sentOf(state.attempt)?.body ? (answer.note.body ?? "") : state.draft,
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
      return {
        ...state,
        attempt: { kind: "in-flight", sent: action.sent },
        adopted: false,
        outcome: "idle",
      };
    case "answer":
      return answered(state, action.answer);
    case "take-newer":
      return state.newer === null || state.attempt.kind === "in-flight"
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
