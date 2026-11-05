import { useCallback, useEffect, useId, useRef, useState } from "react";

import { SETTINGS, filled } from "./access-text.ts";
import { Alert } from "./AuthShell.tsx";

const COPIED_MS = 2000;

function useCopy(value: string) {
  const field = useRef<HTMLOutputElement>(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const showValue = useCallback(() => {
    if (field.current !== null) {
      field.current.focus();
      window.getSelection()?.selectAllChildren(field.current);
    }
  }, []);

  useEffect(showValue, [showValue]);

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
        showValue();
      }
    };

    void write();
  }, [showValue, value]);

  return { field, copied, failed, copy };
}

export function TokenReveal({
  name,
  value,
  done,
}: Readonly<{ name: string; value: string; done: () => void }>) {
  const { field, copied, failed, copy } = useCopy(value);
  const titleId = useId();
  const noteId = useId();

  return (
    <section className="reveal" aria-labelledby={titleId}>
      <h3 id={titleId} className="reveal-title">
        {filled(SETTINGS.revealTitleNamed, { name })}
      </h3>
      <p id={noteId}>{SETTINGS.revealPaste}</p>
      <div className="reveal-row">
        <output
          ref={field}
          className="reveal-value"
          tabIndex={-1}
          aria-label={SETTINGS.tokenValue}
          aria-describedby={noteId}
        >
          {value}
        </output>
        <button type="button" className="btn" onClick={copy}>
          {copied ? SETTINGS.copied : SETTINGS.copy}
        </button>
      </div>
      <output className="vh">{copied ? SETTINGS.copied : ""}</output>
      <Alert text={failed ? SETTINGS.copyFailed : null} />
      <button type="button" className="btn btn-block" onClick={done}>
        {SETTINGS.done}
      </button>
    </section>
  );
}
