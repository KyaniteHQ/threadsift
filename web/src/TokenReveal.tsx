import { type FocusEvent, useCallback, useEffect, useRef, useState } from "react";

import { SETTINGS } from "./access-text.ts";

const COPIED_MS = 2000;

function useCopy(value: string) {
  const field = useRef<HTMLInputElement>(null);
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
        field.current?.select();
      }
    };

    void write();
  }, [value]);

  return { field, copied, failed, copy };
}

const selectAll = (event: FocusEvent<HTMLInputElement>): void => {
  event.target.select();
};

export function TokenReveal({ value, done }: Readonly<{ value: string; done: () => void }>) {
  const { field, copied, failed, copy } = useCopy(value);

  return (
    <section className="reveal" aria-labelledby="reveal-title">
      <h3 id="reveal-title" className="reveal-title">
        {SETTINGS.revealTitle}
      </h3>
      <p>{SETTINGS.revealNote}</p>
      <div className="reveal-row">
        <input
          ref={field}
          className="reveal-value"
          readOnly
          spellCheck={false}
          value={value}
          aria-label={SETTINGS.tokenValue}
          onFocus={selectAll}
        />
        <button type="button" className="btn" onClick={copy}>
          {copied ? SETTINGS.copied : SETTINGS.copy}
        </button>
        <button type="button" className="btn" onClick={done}>
          {SETTINGS.done}
        </button>
      </div>
      <output className="vh">{copied ? SETTINGS.copied : ""}</output>
      {failed ? <p className="fld-err">{SETTINGS.copyFailed}</p> : null}
    </section>
  );
}
