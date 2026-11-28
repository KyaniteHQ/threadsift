import { type ChangeEvent, type ReactNode, useCallback, useId } from "react";

import {
  type ImportList,
  SKIP_REASONS,
  type SkipReason,
  type Skipped as SkippedRows,
} from "../../src/core/contract/import-list.ts";
import { Alert } from "./Alert.tsx";
import {
  IMPORT,
  readyLabel,
  skippedLabel,
  skippedLead,
  skippedLineLabel,
  skippedMoreLabel,
} from "./import-text.ts";
import { useFilePicker } from "./use-file-picker.ts";
import type { ImportInput } from "./use-import-input.ts";

function Skipped({ reason, skipped }: Readonly<{ reason: SkipReason; skipped: SkippedRows }>) {
  const more = skipped.count - skipped.first.length;

  return (
    <div className="flat-note">
      <p>{skippedLabel(reason, skipped.count)}</p>
      <p className="label">{skippedLead(reason)}</p>
      <ul role="list" className="imp-lines">
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

function readyText(count: number, ran: boolean): string | null {
  if (count === 0) return IMPORT.noLinks;

  return ran ? null : readyLabel(count);
}

function Summary({ list, ran }: Readonly<{ list: ImportList; ran: boolean }>) {
  const { links, skipped } = list;
  const shown = SKIP_REASONS.filter((reason) => skipped[reason].count > 0);

  if (links.length === 0 && shown.length === 0) return null;

  return (
    <div className="imp-summary">
      <output>{readyText(links.length, ran)}</output>
      {shown.map((reason) => (
        <Skipped key={reason} reason={reason} skipped={skipped[reason]} />
      ))}
    </div>
  );
}

function FilePart({ locked, input }: Readonly<{ locked: boolean; input: ImportInput }>) {
  const { choose, fileFailed } = input;
  const labelId = useId();
  const hintId = useId();

  const { picker, open, read } = useFilePicker(choose, !locked);

  return (
    <div className="imp-part imp-file">
      <span id={labelId} className="label">
        {IMPORT.fileLabel}
      </span>
      <p id={hintId} className="fld-help">
        {IMPORT.fileHint}
      </p>
      <div>
        <button
          type="button"
          className="btn"
          aria-disabled={locked}
          aria-describedby={`${labelId} ${hintId}`}
          onClick={open}
        >
          {IMPORT.fileButton}
        </button>
      </div>
      <input
        ref={picker}
        type="file"
        hidden
        accept=".csv,.txt,text/csv,text/plain"
        tabIndex={-1}
        onChange={read}
      />
      <Alert text={fileFailed ? IMPORT.fileFailed : null} />
    </div>
  );
}

function PastePart({
  input,
  list,
  locked,
  ran,
  children,
}: Readonly<{
  input: ImportInput;
  list: ImportList;
  locked: boolean;
  ran: boolean;
  children: ReactNode;
}>) {
  const id = useId();
  const hintId = useId();
  const { text, type } = input;

  const change = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      type(event.target.value);
    },
    [type],
  );

  return (
    <div className="imp-part">
      <label className="label" htmlFor={id}>
        {IMPORT.boxLabel}
      </label>
      <p id={hintId} className="fld-help">
        {IMPORT.boxHint}
      </p>
      <textarea
        id={id}
        className="imp-box"
        value={text}
        readOnly={locked}
        rows={8}
        aria-describedby={hintId}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="none"
        onChange={change}
      />
      <Summary list={list} ran={ran} />
      {children}
    </div>
  );
}

export function ListSection({
  input,
  locked,
  ...paste
}: Readonly<{
  input: ImportInput;
  list: ImportList;
  locked: boolean;
  ran: boolean;
  children: ReactNode;
}>) {
  return (
    <div className="imp-form">
      <PastePart input={input} locked={locked} {...paste} />
      <FilePart locked={locked} input={input} />
    </div>
  );
}
