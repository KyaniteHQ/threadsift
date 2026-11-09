import { type Dispatch, type RefObject, useCallback, useEffect, useReducer, useRef } from "react";

import type { NoteView } from "../../src/core/note-contract.ts";
import { putNote } from "./api.ts";
import { draftOf, keepDraft } from "./note-draft.ts";
import {
  type NoteAction,
  type NoteState,
  noteFlags,
  noteReducer,
  noteStart,
} from "./note-state.ts";

function useSend(
  itemId: number,
  draft: string,
  dispatch: Dispatch<NoteAction>,
  field: RefObject<HTMLTextAreaElement | null>,
) {
  const sending = useRef(false);

  return useCallback(
    async (revision: number, resolving: boolean): Promise<void> => {
      if (sending.current) return;

      sending.current = true;
      dispatch({ kind: "send" });

      const answer = await putNote(itemId, { body: draft, revision }).catch(() => null);

      sending.current = false;
      dispatch({ kind: "answer", sent: draft, answer });

      if (resolving && answer?.outcome === "saved") field.current?.focus();
    },
    [itemId, draft, dispatch, field],
  );
}

function view(state: Readonly<NoteState>) {
  const { dirty, tooLong, canSave } = noteFlags(state);

  return {
    draft: state.draft,
    newer: state.newer,
    pending: state.pending,
    failed: state.outcome === "failed",
    justSaved: state.outcome === "saved" && !dirty,
    tooLong,
    canSave,
    dirty,
  };
}

function useKeptDraft(itemId: number, { saved, draft }: Readonly<NoteState>, dirty: boolean) {
  const { revision } = saved;

  useEffect(() => {
    keepDraft(itemId, dirty ? { body: draft, revision } : null);
  }, [itemId, dirty, draft, revision]);
}

export function useNote(
  itemId: number,
  initial: Readonly<NoteView>,
  field: RefObject<HTMLTextAreaElement | null>,
) {
  const [state, dispatch] = useReducer(noteReducer, initial, (saved) =>
    noteStart(saved, draftOf(itemId)),
  );

  const send = useSend(itemId, state.draft, dispatch, field);
  const shown = view(state);
  const { saved, newer } = state;
  useKeptDraft(itemId, state, shown.dirty);

  const save = useCallback(() => {
    if (shown.canSave) void send(saved.revision, false);
  }, [shown.canSave, send, saved.revision]);

  const keepMine = useCallback(() => {
    if (newer !== null && !shown.tooLong) void send(newer.revision, true);
  }, [newer, shown.tooLong, send]);

  const takeNewer = useCallback(() => {
    dispatch({ kind: "take-newer" });
    field.current?.focus();
  }, [field]);

  const edit = useCallback((text: string) => {
    dispatch({ kind: "type", text });
  }, []);

  return { ...shown, edit, save, keepMine, takeNewer };
}
