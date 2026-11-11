import { type ChangeEvent, useCallback, useId, useRef } from "react";

import type { ImportList, SkipReason, Skipped as SkippedRows } from "../../src/core/import-list.ts";
import {
  IMPORT,
  readyLabel,
  skippedLabel,
  skippedLead,
  skippedLineLabel,
  skippedMoreLabel,
} from "./import-text.ts";
import type { ImportInput } from "./use-import-input.ts";

const REASONS: readonly SkipReason[] = ["noLink", "tooLong"];

function Skipped({ reason, skipped }: Readonly<{ reason: SkipReason; skipped: SkippedRows }>) {
  const more = skipped.count - skipped.first.length;

  return (
    <div className="imp-skipped">
      <p>{skippedLabel(reason, skipped.count)}</p>
      <p className="label">{skippedLead(reason)}</p>
      <ul className="imp-lines">
        {skipped.first.map(({ row, text }) => (
          <li key={row}>
            <span className="imp-line">{skippedLineLabel(row)}</span>
            <span className="imp-text">{text}</span>
          </li>
        ))}
      </ul>
      {more > 0 ? <p className="fld-help">{skippedMoreLabel(more)}</p> : null}
    </div>
  );
}

function Summary({ list }: Readonly<{ list: ImportList }>) {
  const { links, skipped } = list;
  const shown = REASONS.filter((reason) => skipped[reason].count > 0);

  if (links.length === 0 && shown.length === 0) return null;

  return (
    <div className="imp-summary">
      <output>{links.length === 0 ? IMPORT.noLinks : readyLabel(links.length)}</output>
      {shown.map((reason) => (
        <Skipped key={reason} reason={reason} skipped={skipped[reason]} />
      ))}
    </div>
  );
}

function FileButton({ locked, input }: Readonly<{ locked: boolean; input: ImportInput }>) {
  const picker = useRef<HTMLInputElement>(null);
  const { choose, fileFailed } = input;

  const read = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const [file] = event.target.files ?? [];

      event.target.value = "";

      if (file !== undefined) void choose(file);
    },
    [choose],
  );

  const open = useCallback(() => {
    if (!locked) picker.current?.click();
  }, [locked]);

  return (
    <div className="imp-file">
      <button type="button" className="btn" aria-disabled={locked} onClick={open}>
        {IMPORT.fileButton}
      </button>
      <input
        ref={picker}
        type="file"
        hidden
        accept=".csv,.txt,text/csv,text/plain"
        tabIndex={-1}
        onChange={read}
      />
      {fileFailed ? (
        <p role="alert" className="fld-err">
          {IMPORT.fileFailed}
        </p>
      ) : null}
    </div>
  );
}

export function ListSection({
  input,
  list,
  locked,
}: Readonly<{ input: ImportInput; list: ImportList; locked: boolean }>) {
  const id = useId();
  const { text, type } = input;

  const change = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      type(event.target.value);
    },
    [type],
  );

  return (
    <div className="sec imp-list">
      <p className="imp-lede">{IMPORT.lede}</p>
      <label className="label" htmlFor={id}>
        {IMPORT.boxLabel}
      </label>
      <textarea
        id={id}
        className="imp-box"
        value={text}
        readOnly={locked}
        rows={8}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="none"
        onChange={change}
      />
      <FileButton locked={locked} input={input} />
      <Summary list={list} />
    </div>
  );
}
