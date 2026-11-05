import {
  type ChangeEvent,
  type SubmitEvent,
  type Dispatch,
  type SetStateAction,
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
  type Notice,
  PASTE_LABEL,
  PASTE_PLACEHOLDER,
  RETRY_LABEL,
  SAVING_LABEL,
  SAVING_STATUS,
} from "./text.ts";
import { useFocusOnMount, useGuard } from "./use-form.ts";

type Save = (url: string) => Promise<SaveOutcome>;

type Shown = Readonly<Notice & { url: string }>;

const EMPTY: SaveOutcome = { saved: false, notice: "empty", focus: "field" };
const FAILED: SaveOutcome = { saved: false, notice: "failed", focus: "field" };
const SCHEME_AND_WWW = /^https?:\/\/(www\.)?/u;

async function attempt(save: Save, url: string): Promise<SaveOutcome> {
  try {
    return await save(url);
  } catch {
    return FAILED;
  }
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
  return useCallback(
    async (url: string) => {
      setNotice(null);
      const outcome = url === "" ? EMPTY : await attempt(save, url);

      if (outcome.saved) {
        setValue((current) => (current.trim() === url ? "" : current));
      }

      setNotice(outcome.notice === null ? null : { ...NOTICES[outcome.notice], url });

      if (outcome.focus === "field") {
        focusField();
      }
    },
    [focusField, save, setNotice, setValue],
  );
}

function usePaste(save: Save, focusOnMount: boolean) {
  const [value, setValue] = useState("");
  const [notice, setNotice] = useState<Shown | null>(null);
  const field = useRef<HTMLInputElement>(null);

  const focusField = useCallback(() => {
    field.current?.focus();
  }, []);

  useFocusOnMount(field, focusOnMount);

  const saveValue = useSaveValue({ save, setValue, setNotice, focusField });

  const { busy: saving, guard } = useGuard();

  const submit = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      const url = value.trim();

      if (url !== "") {
        guard(() => saveValue(url));
      } else if (!saving) {
        void saveValue(url);
      }
    },
    [guard, saveValue, saving, value],
  );

  const dismiss = useCallback(() => {
    setNotice(null);
    focusField();
  }, [focusField]);

  const change = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
    setNotice(null);
  }, []);

  const retry = useCallback(() => {
    if (notice !== null) {
      focusField();
      guard(() => saveValue(notice.url));
    }
  }, [focusField, guard, notice, saveValue]);

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
  const isAlert = notice.kind !== "save-note";

  return (
    <div id={id} className="ps" role={isAlert ? "alert" : undefined}>
      <p className="ps-head">
        <Icon name="warn" className="ic tone-warn" />
        <span className="ps-title">{notice.text}</span>
      </p>
      {notice.url === "" ? null : (
        <p className="ps-url">{notice.url.replace(SCHEME_AND_WWW, "")}</p>
      )}
      <div className="ps-acts">
        {notice.retry ? (
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

  return notice?.kind === "save-note" ? notice.text : "";
}

export function PasteBox({ save, focusOnMount }: Readonly<{ save: Save; focusOnMount: boolean }>) {
  const { field, value, notice, saving, change, dismiss, submit, retry } = usePaste(
    save,
    focusOnMount,
  );

  const noticeId = useId();
  const isInputError = notice?.kind === "input-error";

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
