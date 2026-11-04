import { type ChangeEvent, type SubmitEvent, useCallback, useId, useRef, useState } from "react";

import type { SaveOutcome } from "./api.ts";
import { Icon } from "./Icon.tsx";
import {
  ADD_LABEL,
  DISMISS_LABEL,
  NOTICES,
  type NoticeKey,
  PASTE_LABEL,
  PASTE_PLACEHOLDER,
  SAVING_LABEL,
} from "./text.ts";

type Save = (url: string) => Promise<SaveOutcome>;

const EMPTY: SaveOutcome = { saved: false, notice: "empty" };
const FAILED: SaveOutcome = { saved: false, notice: "failed" };

function useSaving(save: Save) {
  const [saving, setSaving] = useState(false);

  const attempt = useCallback(
    async (url: string): Promise<SaveOutcome> => {
      setSaving(true);

      try {
        return await save(url);
      } catch {
        return FAILED;
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
  const [notice, setNotice] = useState<NoticeKey | null>(null);
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
      const outcome = url === "" ? EMPTY : await attempt(url);

      if (outcome.saved) {
        setValue((current) => (current.trim() === url ? "" : current));
      }

      setNotice(outcome.notice);
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
}: Readonly<{ id: string; notice: NoticeKey; dismiss: () => void }>) {
  return (
    <div id={id} className="ps" role="alert">
      <p className="ps-head">
        <Icon name="warn" className="ic tone-warn" />
        <span className="ps-title">{NOTICES[notice]}</span>
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
      <form className="paste-row" noValidate aria-busy={saving} onSubmit={submit}>
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
          {saving ? SAVING_LABEL : ADD_LABEL}
        </button>
      </form>
      {notice === null ? null : <PasteNotice id={noticeId} notice={notice} dismiss={dismiss} />}
    </div>
  );
}
