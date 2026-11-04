import { type ChangeEvent, type SubmitEvent, useCallback, useId, useRef, useState } from "react";

import type { SaveOutcome } from "./api.ts";
import { Icon } from "./Icon.tsx";
import { ADD_LABEL, DISMISS_LABEL, PASTE_LABEL, PASTE_PLACEHOLDER, REFUSALS } from "./text.ts";

type Notice = keyof typeof REFUSALS | null;

type Save = (url: string) => Promise<SaveOutcome>;

const NOTICE_OF: Readonly<Record<SaveOutcome | "failed", Notice>> = {
  saved: null,
  refused: "invalid",
  failed: "failed",
};

function useSaving(save: Save) {
  const [saving, setSaving] = useState(false);

  const attempt = useCallback(
    async (url: string): Promise<SaveOutcome | "failed"> => {
      setSaving(true);

      try {
        return await save(url);
      } catch {
        return "failed";
      } finally {
        setSaving(false);
      }
    },
    [save],
  );

  return { saving, attempt };
}

function usePaste(save: Save) {
  const [value, setValue] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const field = useRef<HTMLInputElement>(null);
  const { saving, attempt } = useSaving(save);

  const focusField = useCallback(() => {
    field.current?.focus();
  }, []);

  const change = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
    setNotice(null);
  }, []);

  const dismiss = useCallback(() => {
    setNotice(null);
    focusField();
  }, [focusField]);

  const saveValue = useCallback(
    async (url: string) => {
      const outcome = url === "" ? "empty" : await attempt(url);

      if (outcome === "saved") {
        setValue("");
      }

      setNotice(outcome === "empty" ? "empty" : NOTICE_OF[outcome]);
      focusField();
    },
    [attempt, focusField],
  );

  const submit = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      void saveValue(value.trim());
    },
    [saveValue, value],
  );

  return { field, value, notice, saving, change, dismiss, submit };
}

function PasteNotice({
  id,
  notice,
  dismiss,
}: Readonly<{ id: string; notice: keyof typeof REFUSALS; dismiss: () => void }>) {
  return (
    <div id={id} className="ps" role="alert">
      <p className="ps-head">
        <Icon name="warn" className="ic tone-warn" />
        <span className="ps-title">{REFUSALS[notice]}</span>
      </p>
      <div className="ps-acts">
        <button type="button" className="btn btn-plain" onClick={dismiss}>
          {DISMISS_LABEL}
        </button>
      </div>
    </div>
  );
}

export function PasteBox({ save }: Readonly<{ save: Save }>) {
  const { field, value, notice, saving, change, dismiss, submit } = usePaste(save);
  const noticeId = useId();

  return (
    <div className="paste">
      <form className="paste-row" noValidate onSubmit={submit}>
        <label className="field">
          <span className="vh">{PASTE_LABEL}</span>
          <Icon name="link" className="ic" />
          <input
            ref={field}
            type="text"
            inputMode="url"
            enterKeyHint="go"
            autoComplete="off"
            spellCheck={false}
            placeholder={PASTE_PLACEHOLDER}
            value={value}
            aria-invalid={notice === null ? undefined : true}
            aria-describedby={notice === null ? undefined : noticeId}
            onChange={change}
          />
        </label>
        <button type="submit" className="btn btn-acc" disabled={saving}>
          {ADD_LABEL}
        </button>
      </form>
      {notice === null ? null : <PasteNotice id={noticeId} notice={notice} dismiss={dismiss} />}
    </div>
  );
}
