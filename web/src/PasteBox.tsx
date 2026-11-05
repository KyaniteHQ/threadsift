import {
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
  type SubmitEvent,
  useCallback,
  useId,
  useRef,
  useState,
} from "react";

import type { SaveOutcome } from "./api.ts";
import { Icon } from "./Icon.tsx";
import { SwapButton } from "./SwapButton.tsx";
import {
  ADD_LABEL,
  DISMISS_LABEL,
  NOTICES,
  NOTICE_KINDS,
  type NoticeKey,
  PASTE_LABEL,
  PASTE_PLACEHOLDER,
  RETRYABLE_NOTICES,
  RETRY_LABEL,
  SAVING_LABEL,
  SAVING_STATUS,
} from "./text.ts";

type Save = (url: string) => Promise<SaveOutcome>;

type Shown = Readonly<{ key: NoticeKey; url: string }>;

const EMPTY: SaveOutcome = { saved: false, notice: "empty", focus: "field" };
const FAILED: SaveOutcome = { saved: false, notice: "failed", focus: "field" };
const SCHEME_AND_WWW = /^https?:\/\/(www\.)?/u;

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

function useNotice(focusField: () => void) {
  const [notice, setNotice] = useState<Shown | null>(null);

  const dismiss = useCallback(() => {
    setNotice(null);
    focusField();
  }, [focusField]);

  return { notice, setNotice, dismiss };
}

function useSaveValue({
  save,
  setValue,
  setNotice,
  focusField,
}: Readonly<{
  save: Save;
  setValue: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<Shown | null>>;
  focusField: () => void;
}>) {
  const { saving, attempt } = useSaving(save);

  const saveValue = useCallback(
    async (url: string) => {
      if (saving) {
        return;
      }

      setNotice(null);
      const outcome = url === "" ? EMPTY : await attempt(url);

      if (outcome.saved) {
        setValue((current) => (current.trim() === url ? "" : current));
      }

      setNotice(outcome.notice === null ? null : { key: outcome.notice, url });

      if (outcome.focus === "field") {
        focusField();
      }
    },
    [attempt, focusField, saving, setNotice, setValue],
  );

  return { saving, saveValue };
}

function usePaste(save: Save) {
  const [value, setValue] = useState("");
  const field = useRef<HTMLInputElement>(null);

  const focusField = useCallback(() => {
    field.current?.focus();
  }, []);

  const { notice, setNotice, dismiss } = useNotice(focusField);
  const { saving, saveValue } = useSaveValue({ save, setValue, setNotice, focusField });

  const change = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setValue(event.target.value);
      setNotice(null);
    },
    [setNotice],
  );

  const submit = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      void saveValue(value.trim());
    },
    [saveValue, value],
  );

  const retry = useCallback(() => {
    if (notice !== null) {
      focusField();
      void saveValue(notice.url);
    }
  }, [focusField, notice, saveValue]);

  return { field, value, notice, saving, change, dismiss, submit, retry };
}

function PasteNotice({
  id,
  notice,
  dismiss,
  retry,
}: Readonly<{
  id: string;
  notice: Shown;
  dismiss: () => void;
  retry: () => void;
}>) {
  const isAlert = NOTICE_KINDS[notice.key] !== "save-note";

  return (
    <div id={id} className="ps" role={isAlert ? "alert" : undefined}>
      <p className="ps-head">
        <Icon name="warn" className="ic tone-warn" />
        <span className="ps-title">{NOTICES[notice.key]}</span>
      </p>
      {notice.url === "" ? null : (
        <p className="ps-url">{notice.url.replace(SCHEME_AND_WWW, "")}</p>
      )}
      <div className="ps-acts">
        {RETRYABLE_NOTICES.has(notice.key) ? (
          <button type="button" className="btn btn-acc" onClick={retry}>
            {RETRY_LABEL}
          </button>
        ) : null}
        <button type="button" className="btn btn-plain" onClick={dismiss}>
          {DISMISS_LABEL}
        </button>
      </div>
    </div>
  );
}

function announcement(saving: boolean, notice: Shown | null): string {
  if (saving) {
    return SAVING_STATUS;
  }

  return notice !== null && NOTICE_KINDS[notice.key] === "save-note" ? NOTICES[notice.key] : "";
}

export function PasteBox({ save }: Readonly<{ save: Save }>) {
  const { field, value, notice, saving, change, dismiss, submit, retry } = usePaste(save);
  const noticeId = useId();
  const isInputError = notice !== null && NOTICE_KINDS[notice.key] === "input-error";

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
            aria-invalid={isInputError ? true : undefined}
            aria-describedby={notice === null ? undefined : noticeId}
            onChange={change}
          />
        </label>
        <SwapButton label={ADD_LABEL} busyLabel={SAVING_LABEL} busy={saving} />
      </form>
      <output className="vh" aria-live="polite" aria-atomic="true">
        {announcement(saving, notice)}
      </output>
      {notice === null ? null : (
        <PasteNotice id={noticeId} notice={notice} dismiss={dismiss} retry={retry} />
      )}
    </div>
  );
}
