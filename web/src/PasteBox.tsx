import { type ChangeEvent, type SubmitEvent, useCallback, useState } from "react";

import type { SaveOutcome } from "./api.ts";
import { Icon } from "./Icon.tsx";
import { ADD_LABEL, PASTE_LABEL, PASTE_PLACEHOLDER, REFUSALS } from "./text.ts";

type Notice = keyof typeof REFUSALS | null;

type Save = (url: string) => Promise<SaveOutcome>;

function usePaste(save: Save) {
  const [value, setValue] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);

  const change = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
    setNotice(null);
  }, []);

  const saveValue = useCallback(
    async (url: string) => {
      setSaving(true);

      try {
        const outcome = await save(url);
        setNotice(outcome === "saved" ? null : "invalid");

        if (outcome === "saved") {
          setValue("");
        }
      } catch {
        setNotice("failed");
      } finally {
        setSaving(false);
      }
    },
    [save],
  );

  const submit = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      const url = value.trim();

      if (url === "") {
        setNotice("empty");

        return;
      }

      void saveValue(url);
    },
    [saveValue, value],
  );

  return { value, notice, saving, change, submit };
}

function PasteNotice({ notice }: Readonly<{ notice: keyof typeof REFUSALS }>) {
  return (
    <div className="ps" role="alert">
      <p className="ps-head">
        <Icon name="warn" className="ic tone-warn" />
        <span className="ps-title">{REFUSALS[notice]}</span>
      </p>
    </div>
  );
}

export function PasteBox({ save }: Readonly<{ save: Save }>) {
  const { value, notice, saving, change, submit } = usePaste(save);

  return (
    <div className="paste">
      <form className="paste-row" noValidate onSubmit={submit}>
        <label className="field">
          <span className="vh">{PASTE_LABEL}</span>
          <Icon name="link" className="ic" />
          <input
            type="text"
            inputMode="url"
            enterKeyHint="go"
            autoComplete="off"
            spellCheck={false}
            placeholder={PASTE_PLACEHOLDER}
            value={value}
            onChange={change}
          />
        </label>
        <button type="submit" className="btn btn-acc" disabled={saving}>
          {ADD_LABEL}
        </button>
      </form>
      {notice === null ? null : <PasteNotice notice={notice} />}
    </div>
  );
}
