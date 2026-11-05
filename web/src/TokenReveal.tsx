import { useCallback, useEffect, useId, useRef, useState } from "react";

import { SETTINGS, filled } from "./access-text.ts";
import { Alert } from "./AuthShell.tsx";

const COPIED_MS = 2000;
const TOKEN_ROWS = 3;

function useCopy(value: string) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    field.current?.focus();
  }, []);

  useEffect(() => {
    const timer = copied
      ? window.setTimeout(() => {
          setCopied(false);
        }, COPIED_MS)
      : 0;

    return () => {
      window.clearTimeout(timer);
    };
  }, [copied]);

  const copy = useCallback(() => {
    const write = async (): Promise<void> => {
      try {
        await navigator.clipboard.writeText(value);
        setFailed(false);
        setCopied(true);
      } catch {
        setFailed(true);
        field.current?.focus();
        field.current?.select();
      }
    };

    void write();
  }, [value]);

  const selectValue = useCallback(() => {
    field.current?.select();
  }, []);

  return { field, copied, failed, copy, selectValue };
}

export function TokenReveal({
  name,
  value,
  done,
}: Readonly<{ name: string; value: string; done: () => void }>) {
  const { field, copied, failed, copy, selectValue } = useCopy(value);
  const titleId = useId();
  const noteId = useId();

  return (
    <section className="reveal" aria-labelledby={titleId}>
      <h3 id={titleId} className="reveal-title">
        {filled(SETTINGS.revealTitleNamed, { name })}
      </h3>
      <p id={noteId}>{SETTINGS.revealPaste}</p>
      <div className="reveal-row">
        <textarea
          ref={field}
          className="reveal-value"
          readOnly
          rows={TOKEN_ROWS}
          spellCheck={false}
          value={value}
          aria-label={SETTINGS.tokenValue}
          aria-describedby={noteId}
          onFocus={selectValue}
        />
        <button type="button" className="btn" onClick={copy}>
          {copied ? SETTINGS.copied : SETTINGS.copy}
        </button>
      </div>
      <output className="vh">{copied ? SETTINGS.copied : ""}</output>
      <Alert text={failed ? SETTINGS.copyFailed : null} />
      <button type="button" className="btn btn-plain btn-flush" onClick={done}>
        {SETTINGS.done}
      </button>
    </section>
  );
}
