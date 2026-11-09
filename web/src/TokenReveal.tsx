import { useCallback, useId, useRef, useState } from "react";

import { SETTINGS } from "./access-text.ts";
import { Alert } from "./Alert.tsx";
import { filled } from "./text.ts";
import { useAfter, useFocusOnMount } from "./use-form.ts";

const COPIED_MS = 2000;
const TOKEN_ROWS = 2;

function useCopy(value: string) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useFocusOnMount(field);

  const clearCopied = useCallback(() => {
    setCopied(false);
  }, []);

  useAfter(copied, COPIED_MS, clearCopied);

  const copy = useCallback(() => {
    const write = async (): Promise<void> => {
      try {
        await navigator.clipboard.writeText(value);
        setFailed(false);
        setCopied(true);
      } catch {
        setCopied(false);
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
          cols={value.length}
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
      <button type="button" className="btn btn-block" onClick={done}>
        {SETTINGS.done}
      </button>
    </section>
  );
}
