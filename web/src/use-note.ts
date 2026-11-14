import { type Dispatch, type RefObject, useCallback, useEffect, useReducer, useRef } from "react";

import type { NoteView } from "../../src/core/note-contract.ts";
import { putNote } from "./api.ts";
import { draftOf, keepDraft, watchDraft } from "./note-draft.ts";
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
      dispatch({ kind: "send", sent: { body: draft, revision } });

      const answer = await putNote(itemId, { body: draft, revision }).catch(() => null);

      sending.current = false;
      dispatch({ kind: "answer", answer });

      if (resolving && answer?.outcome === "saved") field.current?.focus();
    },
    [itemId, draft, dispatch, field],
  );
}

function view(state: Readonly<NoteState>) {
  const { dirty, tooLong, pending, canSave } = noteFlags(state);

  return {
    draft: state.draft,
    newer: state.newer,
    pending,
    failed: state.outcome === "failed",
    justSaved: state.outcome === "saved" && !dirty,
    tooLong,
    canSave,
    dirty,
  };
}

function useKeptDraft(
  itemId: number,
  { saved, draft, sent, adopted }: Readonly<NoteState>,
  dirty: boolean,
  dispatch: Dispatch<NoteAction>,
) {
  const { revision } = saved;

  useEffect(
    () =>
      watchDraft(itemId, (kept) => {
        dispatch({ kind: "adopt", kept });
      }),
    [itemId, dispatch],
  );

  useEffect(() => {
    if (!adopted) keepDraft(itemId, dirty ? { body: draft, revision, sent } : null);
  }, [itemId, dirty, draft, revision, sent, adopted]);
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
  useKeptDraft(itemId, state, shown.dirty || shown.pending, dispatch);

  const save = useCallback(() => {
    if (shown.canSave) void send(saved.revision, false);
  }, [shown.canSave, send, saved.revision]);

  const keepMine = useCallback(() => {
    if (newer !== null && !shown.tooLong) void send(newer.revision, true);
  }, [newer, shown.tooLong, send]);

  const takeNewer = useCallback(() => {
    if (shown.pending) return;

    dispatch({ kind: "take-newer" });
    field.current?.focus();
  }, [shown.pending, field]);

  const edit = useCallback((text: string) => {
    dispatch({ kind: "type", text });
  }, []);

  return { ...shown, edit, save, keepMine, takeNewer };
}
