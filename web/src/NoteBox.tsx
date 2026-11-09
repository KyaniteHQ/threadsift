import { type ChangeEvent, type KeyboardEvent, useCallback, useId, useRef } from "react";

import type { NoteView } from "../../src/core/note-contract.ts";
import {
  NOTE_CHANGED,
  NOTE_FAILED,
  NOTE_KEEP_MINE,
  NOTE_KEYS,
  NOTE_NEWER_EMPTY,
  NOTE_NEWER_LABEL,
  NOTE_SAVE,
  NOTE_SAVED,
  NOTE_TITLE,
  NOTE_TOO_LONG,
  NOTE_USE_NEWER,
} from "./reader-text.ts";
import { useNote } from "./use-note.ts";

function Newer({
  note,
  pending,
  keepMine,
  takeNewer,
}: Readonly<{
  note: NoteView;
  pending: boolean;
  keepMine: () => void;
  takeNewer: () => void;
}>) {
  return (
    <div className="nt-newer" role="alert">
      <p className="rd-note">{NOTE_CHANGED}</p>
      <blockquote className="nt-text" dir="auto" aria-label={NOTE_NEWER_LABEL}>
        {note.body ?? <span className="rd-note">{NOTE_NEWER_EMPTY}</span>}
      </blockquote>
      <div className="nt-acts">
        <button type="button" className="btn btn-acc" aria-disabled={pending} onClick={keepMine}>
          {NOTE_KEEP_MINE}
        </button>
        <button type="button" className="btn" aria-disabled={pending} onClick={takeNewer}>
          {NOTE_USE_NEWER}
        </button>
      </div>
    </div>
  );
}

function Refusals({
  failed,
  tooLong,
  newer,
  pending,
  keepMine,
  takeNewer,
}: Readonly<{
  failed: boolean;
  tooLong: boolean;
  newer: NoteView | null;
  pending: boolean;
  keepMine: () => void;
  takeNewer: () => void;
}>) {
  return (
    <>
      {failed ? (
        <p className="rd-note" role="alert">
          {NOTE_FAILED}
        </p>
      ) : null}
      {tooLong ? (
        <p className="rd-note" role="alert">
          {NOTE_TOO_LONG}
        </p>
      ) : null}
      {newer === null ? null : (
        <Newer note={newer} pending={pending} keepMine={keepMine} takeNewer={takeNewer} />
      )}
    </>
  );
}

function useKeys(save: () => void) {
  return useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>): void => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        save();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.currentTarget.blur();
      }
    },
    [save],
  );
}

function Actions({
  canSave,
  justSaved,
  keys,
  save,
}: Readonly<{ canSave: boolean; justSaved: boolean; keys: string; save: () => void }>) {
  return (
    <div className="nt-acts">
      <button type="button" className="btn btn-acc" aria-disabled={!canSave} onClick={save}>
        {NOTE_SAVE}
      </button>
      <output className="rd-note">{justSaved ? NOTE_SAVED : ""}</output>
      <span id={keys} className="rd-note nt-keys">
        {NOTE_KEYS}
      </span>
    </div>
  );
}

export function NoteBox({ itemId, initial }: Readonly<{ itemId: number; initial: NoteView }>) {
  const field = useRef<HTMLTextAreaElement>(null);
  const heading = useId();
  const keys = useId();
  const note = useNote(itemId, initial, field);
  const { edit } = note;
  const press = useKeys(note.save);

  const change = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>): void => {
      edit(event.currentTarget.value);
    },
    [edit],
  );

  return (
    <section className="rd-nt" aria-labelledby={heading}>
      <h3 id={heading} className="label">
        {NOTE_TITLE}
      </h3>
      <textarea
        ref={field}
        className="nt-field"
        dir="auto"
        aria-labelledby={heading}
        aria-describedby={keys}
        aria-keyshortcuts="Control+Enter Meta+Enter"
        value={note.draft}
        onChange={change}
        onKeyDown={press}
      />
      <Actions canSave={note.canSave} justSaved={note.justSaved} keys={keys} save={note.save} />
      <Refusals
        failed={note.failed}
        tooLong={note.tooLong}
        newer={note.newer}
        pending={note.pending}
        keepMine={note.keepMine}
        takeNewer={note.takeNewer}
      />
    </section>
  );
}
